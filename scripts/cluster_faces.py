"""Groups faces into persons, Google Photos style: every recurring face becomes a (possibly unnamed)
person that the user can name, merge, hide or correct in the app.

Each run:
  1. Faces not yet in a person join the closest existing person, if they're similar enough.
  2. The rest are clustered among themselves; clusters that appear in at least MIN_PHOTOS photos
     become new unnamed persons. Smaller clusters wait for more photos on a later run.
Faces the user placed or removed by hand (faces.user_assigned) are never moved.

Usage:
    python scripts/cluster_faces.py [--dry-run]

Run after scripts/index_faces.py. Needs POSTGRES_URL_NON_POOLING in .env / .env.local.
"""

import argparse
import os
from collections import defaultdict
from typing import Dict, List

import numpy as np
import psycopg
from dotenv import load_dotenv
from scipy.cluster.hierarchy import fcluster, linkage

load_dotenv()
load_dotenv('.env.local')

# ArcFace cosine similarity, tuned by eye on contact sheets of this library. Faces group together
# while their average similarity to each other stays at or above MIN_AVERAGE_SIMILARITY
# (average linkage: unlike nearest-neighbour chaining, lookalikes don't bridge two people).
# Lower values merge more people by mistake; higher values split people more (by hats,
# sunglasses, masks). Splits are easy to fix in the app (merge), mix-ups are not.
MIN_AVERAGE_SIMILARITY = 0.55
MIN_PHOTOS = 3             # a new person needs faces in at least this many photos

DB_URL = os.getenv('POSTGRES_URL_NON_POOLING')
if not DB_URL:
    raise ValueError("Database URL not found in environment variables")


def parse_vector(text: str) -> np.ndarray:
    return np.array(text.strip('[]').split(','), dtype=np.float32)


def normalize(vectors: np.ndarray) -> np.ndarray:
    return vectors / np.linalg.norm(vectors, axis=-1, keepdims=True)


def cluster(embeddings: np.ndarray) -> np.ndarray:
    """Cluster labels for unassigned faces (average-linkage hierarchical clustering)."""
    if len(embeddings) < 2:
        return np.arange(len(embeddings))
    tree = linkage(embeddings.astype(np.float64), method='average', metric='cosine')
    return fcluster(tree, t=1 - MIN_AVERAGE_SIMILARITY, criterion='distance')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--dry-run', action='store_true', help='report what would change without writing')
    args = parser.parse_args()

    with psycopg.connect(DB_URL) as conn:
        rows = conn.execute("""
            SELECT id, image_id, embedding::text, person_id, user_assigned FROM faces ORDER BY id
        """).fetchall()
        if not rows:
            print("No faces yet; run scripts/index_faces.py first")
            return

        face_ids = np.array([row[0] for row in rows])
        image_ids = np.array([row[1] for row in rows])
        embeddings = normalize(np.stack([parse_vector(row[2]) for row in rows]))
        person_ids = [row[3] for row in rows]
        free = np.array([row[3] is None and not row[4] for row in rows])

        # 1. Join existing persons
        members: Dict[int, List[int]] = defaultdict(list)
        for index, person_id in enumerate(person_ids):
            if person_id is not None:
                members[person_id].append(index)
        joined: Dict[int, List[int]] = defaultdict(list)  # person id -> face ids
        if members and free.any():
            # Same rule as clustering: join when the face's average similarity to the person's
            # faces (its dot product with their mean) is high enough
            persons = list(members)
            means = np.stack([embeddings[members[p]].mean(axis=0) for p in persons])
            free_indices = np.flatnonzero(free)
            sims = embeddings[free_indices] @ means.T
            best = sims.argmax(axis=1)
            for index, choice, sim in zip(free_indices, best, sims[np.arange(len(best)), best]):
                if sim >= MIN_AVERAGE_SIMILARITY:
                    joined[persons[choice]].append(int(face_ids[index]))
                    free[index] = False

        # 2. Cluster the rest into new persons
        free_indices = np.flatnonzero(free)
        labels = cluster(embeddings[free_indices])
        groups: Dict[int, List[int]] = defaultdict(list)
        for index, label in zip(free_indices, labels):
            groups[label].append(index)
        new_persons = [
            group for group in groups.values()
            if len({int(image_ids[i]) for i in group}) >= MIN_PHOTOS
        ]
        new_persons.sort(key=len, reverse=True)

        print(f"{len(rows)} faces · {len(members)} existing persons · "
              f"{sum(map(len, joined.values()))} faces join existing persons · "
              f"{len(new_persons)} new persons from {sum(map(len, new_persons))} faces · "
              f"{len(free_indices) - sum(map(len, new_persons))} faces left unassigned")
        if args.dry_run:
            return

        with conn.cursor() as cur:
            for person_id, ids in joined.items():
                cur.execute("UPDATE faces SET person_id = %s WHERE id = ANY(%s) AND NOT user_assigned",
                            (person_id, ids))
            for group in new_persons:
                # Cover: the face closest to the cluster's centre, i.e. its most typical look
                centroid = normalize(embeddings[group].mean(axis=0))
                cover = group[int(np.argmax(embeddings[group] @ centroid))]
                cur.execute("INSERT INTO persons (cover_face_id) VALUES (%s) RETURNING id", (int(face_ids[cover]),))
                person_id = cur.fetchone()[0]
                cur.execute("UPDATE faces SET person_id = %s WHERE id = ANY(%s) AND NOT user_assigned",
                            (person_id, [int(face_ids[i]) for i in group]))
            # Persons left with no faces (e.g. every face moved away by hand) disappear
            cur.execute("DELETE FROM persons p WHERE NOT EXISTS (SELECT 1 FROM faces f WHERE f.person_id = p.id)")
        conn.commit()
        print("Saved")


if __name__ == "__main__":
    main()

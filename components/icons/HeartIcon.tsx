export default function HeartIcon({ filled = false, flipOnHover = false, color = '#888' }: { filled?: boolean, flipOnHover?: boolean, color?: string }) {
  const colorClass = `fill-[${color}] group-hover:fill-red-700`
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {!filled ? (
        <>
          <path d="M5.72366 13.6327C7.39735 16.209 10.6053 18.2844 12 19C13.3947 18.2844 16.6027 16.209 18.2763 13.6327C20.3685 10.4124 19.8454 5.58183 16.1842 5.04511C13.2553 4.61572 12.1743 7.37092 12 8.26546C11.8257 7.37092 10.7447 4.61572 7.81577 5.04511C4.15457 5.58183 3.63154 10.4124 5.72366 13.6327Z" className={`${colorClass} hidden group-hover:block`} />
          <path d="M12 19L11.7717 19.4449L12 19.562L12.2283 19.4449L12 19ZM5.72366 13.6327L6.14294 13.3603L6.14294 13.3603L5.72366 13.6327ZM7.81577 5.04511L7.88829 5.53982L7.81577 5.04511ZM12 8.26546L11.5092 8.36111C11.555 8.59596 11.7607 8.76546 12 8.76546C12.2393 8.76546 12.445 8.59596 12.4908 8.36111L12 8.26546ZM18.2763 13.6327L17.8571 13.3603L17.8571 13.3603L18.2763 13.6327ZM16.1842 5.04511L16.1117 5.53982L16.1117 5.53982L16.1842 5.04511ZM12.2283 18.5551C10.8633 17.8548 7.74654 15.8287 6.14294 13.3603L5.30437 13.9051C7.04815 16.5893 10.3472 18.7139 11.7717 19.4449L12.2283 18.5551ZM6.14294 13.3603C5.16319 11.8522 4.80239 9.97053 5.10299 8.4282C5.4001 6.90371 6.31864 5.76993 7.88829 5.53982L7.74325 4.55039C5.6517 4.85701 4.47812 6.40686 4.12145 8.23691C3.76826 10.0491 4.19201 12.1929 5.30437 13.9051L6.14294 13.3603ZM7.88829 5.53982C9.15773 5.35372 9.99959 5.84684 10.5657 6.48936C11.152 7.15471 11.4348 7.97912 11.5092 8.36111L12.4908 8.16981C12.3909 7.65726 12.0461 6.6568 11.316 5.82826C10.5659 4.97689 9.40277 4.30711 7.74325 4.55039L7.88829 5.53982ZM12.2283 19.4449C13.6528 18.7139 16.9518 16.5893 18.6956 13.9051L17.8571 13.3603C16.2535 15.8287 13.1367 17.8548 11.7717 18.5551L12.2283 19.4449ZM18.6956 13.9051C19.808 12.1929 20.2317 10.0491 19.8785 8.23691C19.5219 6.40686 18.3483 4.85701 16.2568 4.55039L16.1117 5.53982C17.6814 5.76993 18.5999 6.90371 18.897 8.4282C19.1976 9.97053 18.8368 11.8522 17.8571 13.3603L18.6956 13.9051ZM16.2568 4.55039C14.5972 4.30711 13.4341 4.97689 12.684 5.82826C11.9539 6.6568 11.6091 7.65726 11.5092 8.16981L12.4908 8.36111C12.5652 7.97912 12.848 7.15471 13.4343 6.48936C14.0004 5.84684 14.8423 5.35372 16.1117 5.53982L16.2568 4.55039Z" className={colorClass} />
        </>
      ) : (
        <>
          <path d="M5.72366 13.6327C7.39735 16.209 10.6053 18.2844 12 19C13.3947 18.2844 16.6027 16.209 18.2763 13.6327C20.3685 10.4124 19.8454 5.58183 16.1842 5.04511C13.2553 4.61572 12.1743 7.37092 12 8.26546C11.8257 7.37092 10.7447 4.61572 7.81577 5.04511C4.15457 5.58183 3.63154 10.4124 5.72366 13.6327Z" className={`${colorClass} ${flipOnHover ? 'block group-hover:hidden' : ''}`} />
          <path d="M12 19L11.7717 19.4449L12 19.562L12.2283 19.4449L12 19ZM5.72366 13.6327L6.14294 13.3603L6.14294 13.3603L5.72366 13.6327ZM7.81577 5.04511L7.88829 5.53982L7.81577 5.04511ZM12 8.26546L11.5092 8.36111C11.555 8.59596 11.7607 8.76546 12 8.76546C12.2393 8.76546 12.445 8.59596 12.4908 8.36111L12 8.26546ZM18.2763 13.6327L17.8571 13.3603L17.8571 13.3603L18.2763 13.6327ZM16.1842 5.04511L16.1117 5.53982L16.1117 5.53982L16.1842 5.04511ZM12.2283 18.5551C10.8633 17.8548 7.74654 15.8287 6.14294 13.3603L5.30437 13.9051C7.04815 16.5893 10.3472 18.7139 11.7717 19.4449L12.2283 18.5551ZM6.14294 13.3603C5.16319 11.8522 4.80239 9.97053 5.10299 8.4282C5.4001 6.90371 6.31864 5.76993 7.88829 5.53982L7.74325 4.55039C5.6517 4.85701 4.47812 6.40686 4.12145 8.23691C3.76826 10.0491 4.19201 12.1929 5.30437 13.9051L6.14294 13.3603ZM7.88829 5.53982C9.15773 5.35372 9.99959 5.84684 10.5657 6.48936C11.152 7.15471 11.4348 7.97912 11.5092 8.36111L12.4908 8.16981C12.3909 7.65726 12.0461 6.6568 11.316 5.82826C10.5659 4.97689 9.40277 4.30711 7.74325 4.55039L7.88829 5.53982ZM12.2283 19.4449C13.6528 18.7139 16.9518 16.5893 18.6956 13.9051L17.8571 13.3603C16.2535 15.8287 13.1367 17.8548 11.7717 18.5551L12.2283 19.4449ZM18.6956 13.9051C19.808 12.1929 20.2317 10.0491 19.8785 8.23691C19.5219 6.40686 18.3483 4.85701 16.2568 4.55039L16.1117 5.53982C17.6814 5.76993 18.5999 6.90371 18.897 8.4282C19.1976 9.97053 18.8368 11.8522 17.8571 13.3603L18.6956 13.9051ZM16.2568 4.55039C14.5972 4.30711 13.4341 4.97689 12.684 5.82826C11.9539 6.6568 11.6091 7.65726 11.5092 8.16981L12.4908 8.36111C12.5652 7.97912 12.848 7.15471 13.4343 6.48936C14.0004 5.84684 14.8423 5.35372 16.1117 5.53982L16.2568 4.55039Z" className={colorClass} />
        </>
      )}
    </svg>
  );
}
// Íconos SVG en línea para la navegación del admin (sin librerías). Decorativos: el nombre
// accesible lo da el enlace o botón que los contiene.
export type AdminIconName = "home" | "box" | "upload" | "tag" | "orders" | "settings" | "user" | "logout" | "menu" | "collapse" | "expand";

const PATHS: Record<AdminIconName, string[]> = {
  home: ["M3 11.5 12 4l9 7.5", "M5.5 10v9.5h13V10", "M10 19.5v-5h4v5"],
  box: ["M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z", "M3.5 7.5 12 12l8.5-4.5", "M12 12v9"],
  upload: ["M12 15V4", "M7.5 8.5 12 4l4.5 4.5", "M4.5 15v4.5h15V15"],
  tag: ["M3.5 12.5V4.5h8l9 9-8 8z", "M8 8.5h.01"],
  orders: ["M6 3.5h12v17l-3-2-3 2-3-2-3 2z", "M9 8.5h6", "M9 12.5h6"],
  settings: ["M4 7h10", "M18 7h2", "M4 17h2", "M10 17h10", "M16 4.5v5", "M8 14.5v5"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"],
  logout: ["M10 4.5H5v15h5", "M14 8l4 4-4 4", "M18 12H9"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  collapse: ["M14.5 6 8.5 12l6 6"],
  expand: ["M9.5 6l6 6-6 6"],
};

export function AdminIcon({ name }: { name: AdminIconName }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

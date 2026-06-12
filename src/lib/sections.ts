// Catálogo central de secciones que pueden activarse/desactivarse por rol.
// El id debe coincidir con role_section_permissions.section en la DB.
export const SECTIONS: { id: string; label: string; path: string; group: string }[] = [
  { id: "dashboard",        label: "Dashboard",         path: "/",                 group: "general" },
  { id: "emisiones",        label: "Emisiones",         path: "/emisiones",        group: "operación" },
  { id: "emisiones_nueva",  label: "Nueva Emisión",     path: "/emisiones/nueva",  group: "operación" },
  { id: "emisiones_masiva", label: "Emisión Masiva",    path: "/emisiones/masiva", group: "operación" },
  { id: "confirmaciones",   label: "Confirmaciones",    path: "/confirmaciones",   group: "operación" },
  { id: "portafolio",       label: "Portafolio",        path: "/portafolio",       group: "operación" },
  { id: "honorarios",       label: "Honorarios",        path: "/honorarios",       group: "operación" },
  { id: "programas",        label: "Programas",         path: "/programas",        group: "maestros" },
  { id: "cedentes",         label: "Cedentes",          path: "/cedentes",         group: "maestros" },
  { id: "financistas",      label: "Financistas",       path: "/financistas",      group: "maestros" },
  { id: "importar",         label: "Carga Masiva",      path: "/importar",         group: "maestros" },
  { id: "auditoria",        label: "Auditoría",         path: "/auditoria",        group: "sistema" },
  { id: "admin_usuarios",   label: "Usuarios",          path: "/admin/usuarios",   group: "sistema" },
];

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  backoffice: "Backoffice",
};

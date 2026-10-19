// Para mostrar quién dio un sello o confirmó un canje: los *ByStaffId apuntan
// a la pertenencia al comercio, que tiene al usuario.
export const staffNameSelect = {
  select: { staffUser: { select: { name: true } } },
} as const;

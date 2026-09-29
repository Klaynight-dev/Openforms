/**
 * Identité visuelle des collaborateurs présents : une couleur stable par
 * personne (la même sur l'avatar de l'en-tête et sur son pointeur) et des
 * initiales lisibles.
 */

/** Teintes assez sombres pour porter un texte blanc et se distinguer entre elles. */
const PRESENCE_COLORS = [
  "#2563eb",
  "#db2777",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#4d7c0f",
];

export function presenceColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.split(/[\s.@_-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return letters.toUpperCase();
}

/** Nom court affiché sur un pointeur : le prénom, ou la partie locale de l'email. */
export function shortName(name: string): string {
  const local = name.includes("@") ? name.split("@")[0] : name;
  return local.split(/\s+/)[0] || name;
}

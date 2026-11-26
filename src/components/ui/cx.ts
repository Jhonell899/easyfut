/** Une clases de Tailwind ignorando las vacías: cx("a", cond && "b", null) → "a b". */
export function cx(...clases: (string | false | null | undefined)[]) {
  return clases.filter(Boolean).join(" ");
}

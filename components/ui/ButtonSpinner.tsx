/** Decorative only: the owning button supplies a visible pending label and aria-busy. */
export function ButtonSpinner() {
  return <span aria-hidden="true" className="tp-button-spinner inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-r-transparent align-middle" />;
}

// Empty slot — rendered when no intercepting route matches. Required by
// Next's parallel-route contract so the layout can compose {modal}.
export default function Default() {
  return null;
}

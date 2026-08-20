function compute(x, y) {
  return x * y + x;
}
function classify(v) {
  let threshold = 80;
  if (v > threshold) {
    return 1;
  } else {
    return 0;
  }
}
function square(x) {
  return x * x;
}
//# sourceMappingURL=wasm-calc.ts.map

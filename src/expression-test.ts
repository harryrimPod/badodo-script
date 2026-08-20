import { compile } from "./index";

let passed = 0;
let failed = 0;

function check(name: string, source: string, expected: string): void {
  const actual = compile(source).typescript;
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}\n    expected: ${expected}\n    actual:   ${actual}`);
  }
}

console.log("BDS expression precedence conformance\n");

check("multiplication preserves grouped addition", "result = a * (b + c)", "let result = a * (b + c);");
check("grouped addition preserves multiplication", "result = (a + b) * c", "let result = (a + b) * c;");
check("division preserves right grouping", "result = a / (b / c)", "let result = a / (b / c);");
check("unary preserves grouped operand", "result = -(a + b)", "let result = -(a + b);");
check("natural precedence stays clean", "result = a + b * c", "let result = a + b * c;");
check("left associative chain stays clean", "result = a + b + c", "let result = a + b + c;");
check("subtraction chain stays left associative", "result = a - b - c", "let result = a - b - c;");
check("mixed comparison grouping is explicit", "result = a < b == c", "let result = (a < b) == c;");
check("nested unary avoids decrement syntax", "result = -(-a)", "let result = -(-a);");
check("nested call argument stays grouped", "result = mix(a * (b + c))", "let result = mix(a * (b + c));");
check("parenthesized member object stays grouped", "result = (a + b).x", "let result = (a + b).x;");
check("parenthesized index object stays grouped", "result = (a + b)[i]", "let result = (a + b)[i];");

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);

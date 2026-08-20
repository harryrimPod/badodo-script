import { compile } from "./index";

const examples = [
  {
    name: "variables and conditions",
    source: `
speed = 10
max_temperature = 80

if temperature > max_temperature:
    motor.stop()
    alarm.on()
else:
    alarm.off()
`,
  },
  {
    name: "repeat and function",
    source: `
func blink_light(count):
    repeat count:
        light.on()
        light.off()

blink_light(3)
`,
  },
  {
    name: "events",
    source: `
when button.click:
    door.open()

when sensor.overheat:
    alarm.on()
`,
  },
  {
    name: "property access",
    source: `
motor.speed = 5
door.position.y = 2
`,
  },
  {
    name: "function with return",
    source: `
func add(a, b):
    return a + b

result = add(2, 3)
`,
  },
  {
    name: "data binding",
    source: `
temperature = 70

bind temperature -> gauge.value

watch temperature:
    if value > 80:
        alarm.on()
`,
  },
  {
    name: "nested property watch",
    source: `
watch device.motor.rpm:
    rotor.speed = value
`,
  },
  {
    name: "every frame",
    source: `
speed = 2

every frame:
    rotor.rotate_y(speed * time)
`,
  },
  {
    name: "animate property",
    source: `
animate door.y to 2 in 0.5
animate camera to target in 1
`,
  },
  {
    name: "arrays and for-in",
    source: `
items = [1, 2, 3]
names = ["a", "b", "c"]
first = items[0]

for item in items:
    light.blink(item)

items[1] = 5
`,
  },
  {
    name: "vec3 and color builtins",
    source: `
pos = vec3(1, 2, 3)
red = color(255, 0, 0)
green = color(0, 255, 0)
`,
  },
];

let passed = 0;
let failed = 0;

for (const example of examples) {
  console.log(`\n--- ${example.name} ---`);
  console.log("Source:");
  console.log(example.source.trim());
  console.log("\nGenerated TypeScript:");
  try {
    const result = compile(example.source);
    console.log(result.typescript);
    passed++;
  } catch (err) {
    console.error("ERROR:", err);
    failed++;
  }
}

console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

import { BadodoRuntime } from "./runtime/runtime";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

// Mock node. Domain methods (on/off/open/start...) are independent of the
// runtime's event system, which lives in BadodoRuntime.on / .emit.
function makeNode(name: string) {
  const node: any = {
    __name: name,
    value: 0,
    speed: 0,
    calls: [] as string[],
  };
  node.on = () => node.calls.push("on");
  node.off = () => node.calls.push("off");
  node.start = () => node.calls.push("start");
  node.stop = () => node.calls.push("stop");
  node.open = () => node.calls.push("open");
  node.close = () => node.calls.push("close");
  node.rotate_y = (v: number) => node.calls.push(`rotate_y(${v})`);
  return node;
}

console.log("运行时端到端测试\n");

// Test 1: when + event dispatch
{
  const rt = new BadodoRuntime();
  const door = makeNode("door");
  const button = makeNode("button");
  rt.registerNode("door", door);
  rt.registerNode("button", button);

  rt.run(`
when button.click:
    door.open()
`);

  rt.emit(button, "click");
  check("when 事件触发", door.calls.includes("open"), JSON.stringify(door.calls));
}

// Test 2: bind + tick
{
  const rt = new BadodoRuntime();
  const gauge = makeNode("gauge");
  rt.registerNode("gauge", gauge);

  rt.run(`
temperature = 25
bind temperature -> gauge.value
`);

  rt.tick(0.016);
  check("bind 初始值写入", gauge.value === 25, `gauge.value=${gauge.value}`);
}

// Test 3: watch + reactive value change
{
  const rt = new BadodoRuntime();
  const alarm = makeNode("alarm");
  const sensor = makeNode("sensor");
  sensor.temperature = 70;
  rt.registerNode("alarm", alarm);
  rt.registerNode("sensor", sensor);

  rt.run(`
watch sensor.temperature:
    if value > 80:
        alarm.on()
`);

  rt.tick(0.016);
  check("watch 未超阈值不报警", alarm.calls.length === 0, JSON.stringify(alarm.calls));

  sensor.temperature = 85;
  rt.tick(0.016);
  check("watch 超阈值触发报警", alarm.calls.includes("on"), JSON.stringify(alarm.calls));
}

// Test 4: every frame
{
  const rt = new BadodoRuntime();
  const rotor = makeNode("rotor");
  rt.registerNode("rotor", rotor);

  rt.run(`
speed = 2

every frame:
    rotor.rotate_y(speed * time)
`);

  rt.tick(0.5);
  check("every frame 每帧执行", rotor.calls.includes("rotate_y(1)"), JSON.stringify(rotor.calls));
}

// Test 5: node not found error
{
  const rt = new BadodoRuntime();
  try {
    rt.run(`
door.open()
`);
    check("未注册节点报错", false, "未抛出错误");
  } catch (e) {
    const msg = (e as Error).message;
    check("未注册节点报错", msg.includes("door"), msg);
  }
}

// Test 6: animate scalar tween
{
  const rt = new BadodoRuntime();
  const door = makeNode("door");
  door.y = 0;
  rt.registerNode("door", door);

  rt.run(`
animate door.y to 2 in 1
`);

  rt.tick(0.5);
  const halfway = door.y;
  rt.tick(0.5);
  const done = door.y;
  check("animate 标量补间", Math.abs(halfway - 1) < 1e-9 && Math.abs(done - 2) < 1e-9, `halfway=${halfway}, done=${done}`);
}

// Test 7: animate position (vector) tween
{
  const rt = new BadodoRuntime();
  const camera = makeNode("camera");
  camera.position = { x: 0, y: 0, z: 0 };
  const target = makeNode("target");
  target.position = { x: 4, y: 2, z: 0 };
  rt.registerNode("camera", camera);
  rt.registerNode("target", target);

  rt.run(`
animate camera to target in 1
`);

  rt.tick(1);
  const p = camera.position;
  check("animateTo 位置补间", p.x === 4 && p.y === 2, JSON.stringify(p));
}

// Test 8: vec3 / color builtins
{
  const rt = new BadodoRuntime();

  const capture: any = {};
  rt.registerNode("out", capture);
  rt.run(`
pos = vec3(1, 2, 3)
out.pos = pos
out.red = color(255, 0, 0)
`);

  check("vec3 返回 {x,y,z}", capture.pos.x === 1 && capture.pos.y === 2 && capture.pos.z === 3, JSON.stringify(capture.pos));
  check("color 返回 {r,g,b}", capture.red.r === 255 && capture.red.g === 0, JSON.stringify(capture.red));
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);

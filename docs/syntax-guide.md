# Badodo Script 语法使用说明书（v0.1.1）

> 面向 Web 3D 场景、地图、交互和数据绑定的受限脚本层。写法贴近 Python/GDScript，编译目标为 TypeScript。

## 目录
- [1. 快速起步](#1-快速起步)
- [2. 基础语法约定](#2-基础语法约定)
- [3. 变量与类型](#3-变量与类型)
- [4. 表达式与运算符](#4-表达式与运算符)
- [5. 语句一览](#5-语句一览)
- [6. 场景节点](#6-场景节点)
- [7. 模块与异步](#7-模块与异步)
- [8. 值模型：Map / record / enum / Option / Result](#8-值模型map--record--enum--option--result)
- [9. 共享数据契约（Shared Model）](#9-共享数据契约shared-model)
- [10. 编译与运行：compile / run / pack / wasm / sign](#10-编译与运行compile--run--pack--wasm--sign)
- [11. 转译对照表](#11-转译对照表)
- [12. 运行时与适配器](#12-运行时与适配器)
- [13. 错误与排障](#13-错误与排障)
- [14. 常见配方](#14-常见配方)
- [15. 附录：保留字与限制](#15-附录保留字与限制)

---

## 1. 快速起步

```bash
npm install
npm run build
npx bds run examples/door.bds
npx bds compile examples/door.bds -o examples/door.ts
```

最小可运行示例：

```gdscript
# door.bds
speed = 1

when button.click:
    door.open()

every frame:
    rotor.rotate_y(speed * time)
```

`bds run` 会自动从 AST 收集节点并注册本地 fixture 节点，适合本地验证；真实 3D/地图场景需通过适配器注入真实节点。

---

## 2. 基础语法约定

- **文件后缀**：`.bds`
- **注释**：单行 `#`，无块注释。
- **缩进即块**：`:` 开启块，下一行缩进表示块内容，回退表示块结束。
- **语句分隔**：换行分隔，无需 `;`。
- **标识符**：`[A-Za-z_][A-Za-z0-9_]*`。
- **关键字**：`if else repeat func return when bind watch every animate to in import from as async await type enum true false null`。
- **大小写敏感**。

```gdscript
# 块示例
if temperature > 80:
    alarm.on()
    motor.stop()
else:
    alarm.off()
```

---

## 3. 变量与类型

首次赋值即声明（`let` 语义），无需 `var/let`。

```gdscript
speed = 10
name = "Motor A"
on = true
nothing = null
items = [1, 2, 3]
pos = vec3(1, 2, 3)
```

可选类型注解（显式 `emitTypes` 才保真到 TS）：

```gdscript
speed: i32 = 10
func add(a: i32, b: i32) -> i32:
    return a + b
```

可用类型：`number` / `i32` / `f64` / `string` / `bytes` / `bool` / `null` / `array` / `vec3` / `color` / `map` / `option` / `result` / 命名 `type` / `enum`。

---

## 4. 表达式与运算符

**运算符**：算术 `+ - * /`、比较 `> < >= <= == !=`、赋值 `=`、绑定 `->`。

**字面量**：数字 `10` `3.14`、字符串 `"hello"`、布尔 `true/false`、`null`、数组 `[1,2,3]`、Map `{ "a": 1, b: 2 }`。

**优先级（高→低）**：后缀访问 `. [] ()`、一元 `+/-`、乘除、加减、比较。括号可显式保分组。

```gdscript
x = 10
y = x + 5 * 2
items[0] = 99
state = { "online": true, temperature: 25 }
value = state["temperature"]
```

---

## 5. 语句一览

### 变量赋值
```gdscript
speed = 10
motor.speed = 5
```

### 条件 if/else
```gdscript
if temperature > 80:
    alarm.on()
else:
    alarm.off()
```

### 重复 repeat
```gdscript
repeat 3:
    light.blink()
```

### 函数 func / return
```gdscript
func add(a, b):
    return a + b

result = add(2, 3)
```

### 事件 when
```gdscript
when button.click:
    door.open()
```
> 使用 `on(node, event, handler)` 运行时，避免与 `Light.on()` 语义冲突。

### 数据绑定 bind
```gdscript
bind temperature -> gauge.value
```

### 数据监测 watch（隐式 `value`）
```gdscript
watch temperature:
    if value > 80:
        alarm.on()
```

### 每帧 every frame（隐式 `time` 秒）
```gdscript
every frame:
    rotor.rotate_y(speed * time)
```

### 动画 animate
```gdscript
animate door.y to 2 in 0.5        # 属性补间
animate camera to target in 1      # 位置补间
```

### 遍历 for ... in
```gdscript
for item in items:
    light.blink(item)
```

---

## 6. 场景节点

节点名即标识符，无需 `get_node`：

```gdscript
door.open()
motor.speed = 10
camera.look_at(target)
```

编译时通过 AST 收集节点名，运行时 `registerNode(name, object)` 注入。未注册节点会抛 `节点「xxx」未找到`。

- 保留字节点名（如 `switch`）在 `bds run` 下会自动别名为 `__bds_node_switch` 执行，`compile` 输出保持原名。
- `bds run` 的本地 fixture 节点为 Proxy，`addEventListener` 为 `undefined` 以保留 Runtime 的内存事件注册，未知方法为 no-op。

---

## 7. 模块与异步

```gdscript
import device from "./device"
import { fetch_state as fetchState } from "./telemetry"
import "./startup"
```

转译为标准 TypeScript `import`，依赖解析由宿主 bundler 完成。

```gdscript
async func load_state() -> Device:
    return await fetch_state()
```

`async func` 映射为 `async function`，`await` 仅允许在 `async func` 内。

---

## 8. 值模型：Map / record / enum / Option / Result

```gdscript
# Map
state = { "online": true, temperature: 25 }

# record / enum（仅顶层）
type Device:
    id: string
    online?: bool

enum Status:
    idle
    running

# Option / Result
present = some(state)
missing = none()
response = ok(state)
failure = err("offline")
if is_ok(response):
    value = unwrap(response)
```

`vec3` / `color` 为运行时内置，返回 `{x,y,z}` / `{r,g,b}`。

---

## 9. 共享数据契约（Shared Model）

跨 TypeScript / JSON Schema / Go / C# 的受限数据契约，仅在文件顶层使用 `@shared`：

```gdscript
@shared type DeviceState:
    id: string
    online: bool
    temperature: f64

type Wrapped:
    label?: string
```

- 字段后 `?` 表示 wire-optional。
- 工具 API 的第二个参数可提供 schema version、rename、验证约束、serializer metadata（不改 BDS 源名）。

Go / C# 为受限投影，任意场景行为仍以 TypeScript/Web 运行时为主。

---

## 10. 编译与运行：compile / run / pack / wasm / sign

```bash
# 编译为 TypeScript（含 source map）
npx bds compile examples/door.bds -o examples/door.ts
npx bds examples/door.bds examples/door.ts   # 省略 compile 亦可

# 一键运行（类似 python xxx.py）
npx bds run examples/door.bds
npx bds run examples/door.bds --strict --nodes button,door --target web --emit-types

# 加密打包为二进制
npx bds pack examples/door.bds -k "a-production-key-at-least-16-chars"

# 纯计算函数 → WASM
npx bds wasm examples/wasm-calc.bds
```

签名与许可证（发行端）：

```bash
npx bds keygen keys
npx bds pack scene.bds scene.bds.bin -k "a-production-key-at-least-16-chars"
npx bds sign scene.bds.bin --private-key keys/bds-signing-private.pem --license claims.json scene.bds.signed.json
npx bds verify scene.bds.signed.json --public-key keys/bds-signing-public.pem --feature web3d
```

WASM 仅支持纯计算函数（无节点/事件/IO），尚未支持的写法会在编译期提示。

---

## 11. 转译对照表

| Badodo Script | TypeScript |
|---|---|
| `speed = 10` | `let speed = 10;` |
| `motor.speed = 10` | `motor.speed = 10;` |
| `if x > 80:` | `if (x > 80) {` |
| `repeat 3:` | `for (let __i = 0; __i < 3; __i++) {` |
| `func f(a, b):` | `function f(a, b) {` |
| `when a.b:` | `on(a, "b", () => {` |
| `bind x -> n.p` | `bind(() => x, n, "p");` |
| `watch x:` | `watch(() => x, (value) => {` |
| `every frame:` | `onFrame((time) => {` |
| `animate n.p to v in d` | `animate(n, "p", v, d);` |
| `animate n to t in d` | `animateTo(n, t, d);` |
| `for x in arr:` | `for (const x of arr) {` |
| `items[0]` | `items[0]` |

---

## 12. 运行时与适配器

依赖 `BadodoRuntime` 的 5 个能力：`on` / `bind` / `watch` / `onFrame` / `animate`·`animateTo`。

```ts
const rt = new BadodoRuntime();
rt.registerNode("door", doorMesh);
rt.run(source);
```

适配器（框架无关 → 引擎）：

- **Babylon.js**：`createMeshNode` / `createLightNode` / `createCameraNode` / `bridgeMeshClick`
- **MapLibre**：`createMapNode` / `createMarkerNode` / `createCircleLayerNode` / `bridgeMapEvents` / `bridgeMarkerClick`

`pack` 的二进制格式为 `[magic "BDS1" (4)][IV (12)][auth tag (16)][AES-256-GCM ciphertext]`，payload 为 `{ version, nodeNames, code }`。

---

## 13. 错误与排障

- **中文报错**，含行列号与示例。
- 缺节点：`节点「xxx」未找到。请先用 registerNode("xxx", ...) 注册它。`
- `bds run` 暂不支持 `import`：`bds run 不支持直接执行包含 import 的文件；请先使用 bundler 解析模块`。
- `await` 只能在 `async func` 内。
- `pack` 必须显式提供至少 16 字符密钥，无内置默认密钥。

---

## 14. 常见配方

**数据驱动颜色**：
```gdscript
watch data.temperature:
    if value > 80:
        sensor_layer.set_color(color(255, 60, 60))
    else:
        sensor_layer.set_color(color(80, 180, 255))
```

**地图交互**：
```gdscript
when map.load:
    map.set_center([116.39, 39.9], 12)

when sensor.click:
    sensor.highlight()
    map.fly_to([116.39, 39.9], 16)
```

**批量处理**：
```gdscript
items = [1, 2, 3]
for item in items:
    light.blink(item)
```

---

## 15. 附录：保留字与限制

- **保留字**：`if else repeat func return when bind watch every animate to in import from as async await type enum true false null`，以及 `bds run` 下的 38 个 JS 保留字别名（`switch` 等）。
- **尚未支持**：动态模块执行、泛型自定义类型、函数默认/命名参数、深度响应式（`bind/watch` 为每帧轮询）、绝对安全的客户端加密。
- **更多规范**：见 `docs/spec.md`；验收边界见 `docs/ga-contract.md`。

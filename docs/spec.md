# Badodo Script 语言规范（v0.1）

> 一门面向 Web 3D 场景、交互和数据绑定的小型脚本语言。
> 受 GDScript 启发，但更克制、更易读，可直接转译为 TypeScript。

- 全名：Badodo Script（简称 **BDS**）
- 文件后缀：`.bds`
- 编译链：`.bds` → AST → TypeScript → JavaScript → Babylon.js / Web Runtime

---

## 1. 定位与原则

Badodo Script 不是通用语言，只服务：Scene、Node、UI、Animation、Interaction、Data、Device State、Web 3D。

核心原则：

1. **小** — 语法尽量少，只保留必要逻辑
2. **美** — 代码可直接读懂，不暴露计算机内部复杂性
3. **易读** — 接近自然语言和数学题结构，少用符号
4. **可迁移** — 天然转译为 TypeScript，便于晋升

晋升路线：

```text
Visual Blocks → Badodo Script（Basic/Scene/Advanced）→ TypeScript → Babylon.js
```

---

## 2. 词法结构

### 2.1 注释

```gdscript
# 这是单行注释
```

### 2.2 标识符

- 使用英文字符：`[a-zA-Z_][a-zA-Z0-9_]*`
- 不强制使用中文字符（保持工具链纯净）

```gdscript
speed = 10
temperature = 70
door_y = 2
```

### 2.3 关键字

```text
if  else  repeat  func  return  when
bind  watch  every  animate  to  in
import  from  as  async  await  type  enum
true  false  null
```

### 2.4 字面量

| 类型 | 示例 |
|------|------|
| 数字 | `10` `3.14` `0.5` |
| 字符串 | `"hello"` |
| 布尔 | `true` `false` |
| 空 | `null` |

### 2.5 运算符

```text
算术：  +  -  *  /
比较：  >  <  >=  <=  ==  !=
赋值：  =
绑定：  ->
```

表达式优先级从高到低为：一元 `+/-`、乘除 `* /`、加减 `+ -`、比较。括号可以包裹任意表达式，并继续进行成员、索引和调用后缀访问。解析时保留分组语义；TypeScript generator 只省略不影响语义的冗余括号，右侧同级运算和低优先级子表达式会显式加括号。

---

## 3. 缩进与块

Badodo Script 使用**缩进**表示代码块（同 GDScript/Python）。

- 冒号 `:` 表示块开始
- 下一行缩进表示块内容
- 缩进回退表示块结束

```gdscript
if temperature > 80:
    alarm.on()      # 块内
    motor.stop()    # 块内
else:
    alarm.off()     # 另一块
```

---

## 4. 类型系统

默认仍可省略类型声明，由编译器推断。Phase 1 增加可选的变量和函数签名类型注解；默认 TypeScript 输出保持兼容并擦除注解。通过 `compile(source, sourceName, { emitTypes: true })`、`compileStrict(..., { emitTypes: true })` 或 CLI `--emit-types` 可显式启用类型保真投影。

```text
number  i32  f64  string  bytes  bool  null  array  vec3  color
```

```gdscript
speed = 10           # number
name = "Motor"       # string
on = true            # bool
nothing = null       # null
items = [1, 2, 3]    # array
pos = vec3(1, 2, 3)  # vec3 → { x, y, z }
red = color(255, 0, 0)  # color → { r, g, b }（0-255）
```

可选注解示例：

```gdscript
speed: i32 = 10

func add(a: i32, b: i32) -> i32:
    return a + b
```

当前类型检查范围：`bool`、`i32`、`f64`、`string`、`bytes`、`array`、`map`、命名 `type`、`enum`、Option、Result、数值运算、比较、函数参数/返回值和数组/Map 索引。复杂泛型仍由宿主 TypeScript 类型系统承载。

核心值模型：

```gdscript
state = { "online": true, temperature: 25 }
present = some(state)
missing = none()
response = ok(state)
failure = err("offline")
if is_ok(response):
    state = unwrap(response)
```

Map 投影为 TypeScript object；`some`/`none` 投影为 Option 值对象；`ok`/`err`
投影为 Result 值对象。`unwrap` 在失败边界抛出异常，宿主服务层应优先转换为
HTTP/MQTT/C# 的显式错误结果。

命名 record 与 enum 只允许在文件顶层：

```gdscript
type Device:
    id: string
    online?: bool

enum Status:
    idle
    running
```

### 4.1 Shared Model（Phase 2 最小切片）

`@shared type` 只允许出现在文件顶层，用于声明跨目标数据契约：

```gdscript
@shared type DeviceState:
    id: string
    online: bool
    temperature: f64
```

当前支持的字段类型为 `bool`、`i32`、`f64`、`string`、`bytes` 和 `array`。字段名后加 `?` 表示 wire-optional：

```gdscript
label?: string
```

Shared 声明不生成运行时代码；通过工具 API 投影为 TypeScript `interface` 与 JSON Schema。未标记字段默认 required，暂不支持默认值、泛型或递归校验。

工具 API 的第二个参数可提供 schema version/id、字段投影名、有限验证约束和 serializer metadata。字段 metadata 使用 `TypeName.fieldName` 作为键；rename 只影响目标投影（TypeScript、JSON 和受限 Go），BDS 源字段名保持 canonical。当前验证约束为 `minLength`、`maxLength`、`minimum`、`maximum`、`pattern`、`minItems`、`maxItems`。

Shared Model RC 还提供运行时验证、Schema compatibility report、TypeScript validator source 和受限 Go record projection。兼容性检查将删除字段、required 化、类型变化、JSON rename、serializer/format 变化和约束收紧视为 breaking；新增 optional 字段视为 compatible warning。Go `Validate()` 不把必填 string/bytes 的零值强行视为空缺，wire presence 以 JSON Schema 为准。

### 4.2 Ingress 合同

`src/payload.ts` 定义加密 payload 的稳定合同：`version: 1`、`nodeNames: string[]`、`code: string`，拒绝空节点名、重复节点名和额外字段。`decryptPayload`、`unpackScript` 与 `BadodoRuntime.runCompiled` 在执行代码前统一调用该校验。Shared record 不隐式进入脚本运行入口，adapter 应显式调用 `validateSharedIngress` 或 `assertSharedIngress`。

### 4.3 Restricted Go service projection

`generateGoServer(declarations, services, options)` 接收已声明的 Shared records 与 transport-neutral service spec，生成同包 `records.go`、`server.go`：service interface 使用 `context.Context` 和标准 `error`，handler 在调用实现前校验 request，并在返回前校验 response。本阶段不定义 HTTP/MQTT 路由，不开放 goroutine、channel 或框架 runtime。

### 4.4 Strict Compile

`compileStrict(source, options)` 是独立的 AI/CI 阻断入口，不改变默认 `compile()`/`analyze()` 的兼容模式。默认要求显式 `nodeNames` 清单；清单外场景节点、重复清单、类型错误和 `target` 不支持的 runtime/builtin capability 会产生 `StrictCompileError`。设置 `requireNodeManifest: false` 才允许保留兼容模式的隐式场景节点。

`emitTypes` 只投影有稳定宿主类型的注解：`bool → boolean`、`i32/f64/number → number`、`string → string`、`bytes → Uint8Array`、`array → unknown[]`、`map → Record<string, unknown>`、`option → Option<unknown>`、`result → Result<unknown, unknown>`、`unit → void`；本文件中的命名 `type`/`enum` 输出为对应声明。

### 4.5 Go HTTP Adapter

`generateGoHTTP(...)` 接收 Shared records、service spec 和显式 route spec，生成 `records.go`、`server.go`、`http.go`。HTTP route 仅支持静态路径、标准 JSON body、单请求/单响应；adapter 固定执行 body 大小限制、JSON unknown-field 拒绝、Shared request/response 校验，并映射 400（JSON/协议错误）、422（request schema 错误）、500（service/response 错误）和 404（未知 route）。认证、动态路径、query 模板、streaming、MQTT 和 WebSocket 由宿主应用负责。

### 4.6 Go MQTT Adapter

`generateGoMQTT(...)` 接收 Shared records、service spec 和显式 topic route，生成 `records.go`、`server.go`、`mqtt.go`。只支持静态 UTF-8 topic、QoS 0/1、JSON 单请求/单响应；响应 topic 固定为 `<request-topic>/response`。生成的 `MQTTTransport` 只定义 `Publish`/`Subscribe`，不绑定 broker SDK。adapter 固定拒绝空/超大 payload、wildcard/template topic、unknown JSON fields 和不满足 Shared schema 的 request/response；QoS 2、认证/TLS、动态 topic、streaming、共享订阅和离线队列由宿主应用负责。

### 4.7 Shared C# Projection

`generateSharedCSharp(...)` 将 Shared records 投影为 C# `sealed class` DTO：`bool → bool`、`i32 → int`、`f64/number → double`、`string → string`、`bytes → byte[]`、`array → List<object?>`；可选字段使用 nullable 类型。生成属性带 `JsonPropertyName`，通过 init setter 记录 wire presence，`Validate()` 执行 required、嵌套 Shared 和有限约束校验。`csharpName`、`jsonName` 和 `tsName` 相互独立。`generateGodotRuntime()` 额外生成 dependency-free C# runtime bridge，提供节点注册、事件、每帧 tick 和时间校验；具体 Godot Node/Variant 包装由宿主注入。

`vec3` 和 `color` 是运行时内置函数，返回纯对象，由适配器转成框架向量/颜色。

---

## 5. 语句

### 5.1 变量赋值

```gdscript
speed = 10
temperature = 70
name = "Motor A"
```

转译：

```typescript
let speed = 10;
```

规则：首次对标识符赋值即声明变量（`let`）。无需 `var` / `let` 关键字。

#### 5.1.1 作用域与重复赋值（澄清）

本节澄清 5.1「首次赋值即声明」在嵌套代码块中的含义，TypeScript 后端与结构化执行器遵循同一规则（`src/scope.ts`）：

- **作用域**：顶层、每个 `func` 函数体、每个代码块（`if` / `else` / `repeat` / `for` / `when` / `watch` / `every frame`）各是一层作用域。
- **首次赋值**：名字在当前可见范围内尚未声明时，`name = value` 在**当前代码块**声明它。
- **重复赋值**：名字已在当前块或外层块声明时，`name = value` 是普通赋值，不再声明，也不会在内层块产生同名新变量。
- **函数边界**：查找在最近的函数边界停止。函数体内的赋值不会改写顶层变量，而是声明函数自己的局部变量；函数参数可以被重新赋值。
- **隐式变量**：`for` 的循环变量、`watch` 的 `value`、`every frame` 的 `time` 属于各自的块，可以被重新赋值。
- **先声明后可见**：按源码顺序生效；块内声明的变量在块结束后不可见，块外再赋值会重新声明。

```gdscript
count = 0
when button.click:
    count = count + 1   # 更新顶层 count，不是新变量
```

```typescript
let count = 0;
on(button, "click", () => {
  count = count + 1;
});
```

### 5.2 条件判断 if / else

```gdscript
if temperature > 80:
    alarm.on()
else:
    alarm.off()
```

转译：

```typescript
if (temperature > 80) {
  alarm.on();
} else {
  alarm.off();
}
```

### 5.3 重复 repeat

```gdscript
repeat 3:
    light.blink()
```

转译：

```typescript
for (let __i = 0; __i < 3; __i++) {
  light.blink();
}
```

### 5.4 函数 func / return

```gdscript
func add(a, b):
    return a + b
```

转译：

```typescript
function add(a, b) {
  return a + b;
}
```

- 参数：位置参数，逗号分隔
- 无参数：`func stop():`

### 5.5 事件 when

```gdscript
when button.click:
    door.open()

when sensor.overheat:
    alarm.on()
```

转译：

```typescript
on(button, "click", () => {
  door.open();
});
```

> 设计说明：事件注册使用运行时函数 `on(node, event, handler)`，而不是 `node.on(...)`。
> 这样避免与 `Light.on()`（开灯）的领域语义冲突。

### 5.6 数据绑定 bind

```gdscript
bind temperature -> gauge.value
```

转译：

```typescript
bind(() => temperature, gauge, "value");
```

语义：把数据源（getter）绑定到节点属性，数据源变化时自动写入。

### 5.7 数据监测 watch

```gdscript
watch temperature:
    if value > 80:
        alarm.on()
```

转译：

```typescript
watch(() => temperature, (value) => {
  if (value > 80) {
    alarm.on();
  }
});
```

语义：监测数据源，值变化时回调。块内隐式变量 `value` 表示当前值。

### 5.8 每帧更新 every frame

```gdscript
speed = 2

every frame:
    rotor.rotate_y(speed * time)
```

转译：

```typescript
onFrame((time) => {
  rotor.rotate_y(speed * time);
});
```

语义：每帧执行。块内隐式变量 `time` 表示累计时间（秒）。

### 5.9 动画 animate

```gdscript
animate door.y to 2 in 0.5      # 属性补间
animate camera to target in 1    # 位置补间
```

转译：

```typescript
animate(door, "y", 2, 0.5);
animateTo(camera, target, 1);
```

语义：
- `animate 节点.属性 to 值 in 时长` — 属性从当前值线性过渡到目标值
- `animate 节点 to 目标节点 in 时长` — 位置从当前位置移动到目标节点位置

### 5.10 遍历 for ... in

```gdscript
items = [1, 2, 3]

for item in items:
    light.blink(item)
```

转译：

```typescript
for (const item of items) {
  light.blink(item);
}
```

语义：遍历数组（或可迭代对象），`item` 为当前元素。

### 5.11 模块 import

```gdscript
import device from "./device"
import { fetch_state as fetchState } from "./telemetry"
import "./startup"
```

转译为标准 TypeScript import。BDS 编译器不解析宿主模块图；Node/浏览器
bundler 负责依赖解析，BadodoRuntime 只执行已解析的编译产物。

### 5.12 async / await

```gdscript
async func load_state() -> Device:
    return await fetch_state()
```

`async func` 转译为 `async function`，声明返回类型时自动包裹 `Promise<T>`。
`await` 只能出现在 `async func` 内。

---

## 6. 表达式

### 6.1 优先级（从高到低）

```text
后缀访问 . [] ()
一元 - +
乘除 * /
加减 + -
比较 > < >= <= == !=
```

### 6.2 算术

```gdscript
x = 10
y = x + 5
z = y * 2
```

### 6.3 比较

```gdscript
if x > y:
    ...
if temperature >= 80:
    ...
```

### 6.4 数组字面量与索引

```gdscript
items = [1, 2, 3]
first = items[0]     # 索引访问
items[1] = 5         # 索引赋值
```

转译：

```typescript
let items = [1, 2, 3];
let first = items[0];
items[1] = 5;
```

#### 6.4.1 List 规范同步（Task11 canonical 同步）

`[expr, ...]` 为 canonical List 语法，AST 载体为 `ArrayLiteral { elements: Expr[] }`，语义注册 ID 为 `collection.list`。两者为同一语义的两面，不分叉：`ArrayLiteral` 不变，`collection.list` 为 registry 侧别名。语言项目此前无 `TypedHirNode`、`Visual-Safe`、`parametric registry`、`text.concat` 命名函数，本节为首次权威记录，不引入 `List<T>`、`union`、`Any`、top/bottom 新类型。

- 有序元素：`parser.parseArrayLiteral`、`generator`、`runtime/collect-nodes`、`RuntimeExecutor` 均按源码顺序保留与遍历元素。
- Arity 模型为 `PARAMETRIC`：`MIN 0`，`MAX PARAMETRIC`。`[]` 合法，上界无固定值，registry 不得展开为 `input1 ... inputN`，不得为 List 在 registry core 开特例。
- 类型模型为 `array<element>`，复用 `src/type-checker.ts merge()` 与 `unknown` 语义：同质取公共类型，`i32 + f64 → f64`；`[] → array<unknown>`，不得补 `none`、`0`、`""` 推导元素类型；异质 `[1, "a"]` 有效，保守为 `array<unknown>`，不报错；嵌套 `[[1, 2], [3, 4]] → array<array<i32>>`，递归不展平。
- 求值顺序为 left-to-right：`RuntimeExecutor` 对 `ArrayLiteral` 按序 `evaluate` 每个元素，每次求值产生新的 `RuntimeValue[]`。
- Runtime 表示为 JS `Array`：支持 `length` 只读、`[index]` 读写、`for-in` 遍历数组或字符串。`WASM` 纯计算子集不支持 `ArrayLiteral`，`isPureExpr` 直接返回 `false`。
- SourceMap 为行级：`sourcemap.ts` 只映射 `generatedLine → sourceLine`，列统一为 `0`。List 容器与元素共享语句行映射，单行与多行写法均可回映射到 `.bds` 行，不承诺元素级列精度。
- 参数化签名采纳 domain-neutral `parametric ordered inputs` 模型，要求 registry 以有序参数数组表达，不写死 `inputN` 字段。既有固定签名不受影响：BDS core 无 `text.concat` 命名函数，`BinaryOp +` 的字符串拼接保持 binary，不推导 `text.concat(a, b, c)` 或展平 concat 链，variadic Text Join 仍为未来独立语言设计问题，`EXPECTED: NO`。
- Visual-Safe 边界：`BDS Full ⊃ BDS Visual-Safe`。List 容器语义可为 Visual-Safe，子表达式不必然 Visual-Safe。合法但图形不支持的子表达式必须原样保留、可往返，图形工具不得静默丢弃，不得改写语义。

---

## 7. 场景节点

节点是 Badodo Script 的一等公民，按场景名字直接访问。

```gdscript
door.open()          # 调用节点方法
motor.speed = 10     # 读写节点属性
camera.look_at(target)  # 节点作为参数
```

- 节点名直接作为标识符使用，无需 `scene.get_node("door")`
- 底层转译时，节点名通过运行时注入作用域

---

## 8. 转译规则总表

| Badodo Script | TypeScript |
|---------------|-----------|
| `speed = 10` | `let speed = 10;` |
| `motor.speed = 10` | `motor.speed = 10;` |
| `if x > 80:` | `if (x > 80) {` |
| `repeat 3:` | `for (let __i = 0; __i < 3; __i++) {` |
| `func f(a, b):` | `function f(a, b) {` |
| `return x` | `return x;` |
| `when a.b:` | `on(a, "b", () => {` |
| `bind x -> n.p` | `bind(() => x, n, "p");` |
| `watch x:` | `watch(() => x, (value) => {` |
| `every frame:` | `onFrame((time) => {` |
| `animate n.p to v in d` | `animate(n, "p", v, d);` |
| `animate n to t in d` | `animateTo(n, t, d);` |
| `for x in arr:` | `for (const x of arr) {` |
| `[1, 2, 3]` | `[1, 2, 3]` |
| `items[0]` | `items[0]` |
| `animate n to t in d` | `animateTo(n, t, d);` |

---

## 9. 运行时接口

生成的 TypeScript 依赖以下运行时能力，由 `BadodoRuntime` 提供：

| 运行时 | 签名 | 说明 |
|--------|------|------|
| `on` | `(node, event, handler)` | 事件注册 |
| `bind` | `(getter, node, prop)` | 数据绑定（每帧轮询） |
| `watch` | `(getter, handler)` | 数据监测（每帧轮询） |
| `onFrame` | `(handler)` | 每帧更新，`handler(time)` |
| `animate` | `(node, prop, value, duration)` | 标量/向量补间 |
| `animateTo` | `(node, target, duration)` | 位置补间 |

节点解析：脚本中引用的节点名，编译时通过 AST 收集，运行时按名解析并注入作用域。

---

## 10. 框架适配器

运行时核心框架无关，通过适配器连接具体渲染引擎。

### Babylon.js（3D 场景）

节点对应 Mesh / Light / Camera，适配器把 Babylon 对象包装成带领域方法的 Badodo 节点，并把 `pointer` 事件桥接为 `click` 等事件。

| 函数 | 说明 |
|------|------|
| `createMeshNode(mesh)` | 包装网格：`rotate_x/y/z` / `set_position` / `set_scale` / `set_color` / `show` / `hide` |
| `createLightNode(light)` | 包装光源：`on` / `off` / `switch` / `set_intensity` |
| `createCameraNode(camera)` | 包装相机：`set_position` / `look_at` |
| `bridgeMeshClick(scene, mesh, node, rt)` | 桥接网格 `click` 事件 |

### MapLibre GL JS（地图场景）

适配器提供以下工厂函数：

| 函数 | 说明 |
|------|------|
| `createMapNode(map)` | 包装地图实例：`set_center` / `fly_to` / `set_zoom` / `zoom_in` / `zoom_out` |
| `createMarkerNode(marker)` | 包装标记：`show` / `hide` / `highlight` / `unhighlight` / `set_label` |
| `createLayerNode(map, id)` | 包装图层：`show` / `hide` |
| `createCircleLayerNode(map, id)` | 包装圆点图层：`set_color` / `set_radius` / `set_opacity` / `show` / `hide` |
| `bridgeMapEvents(map, node, rt)` | 桥接地图 `load` / `click` / `move_end` 事件 |
| `bridgeMarkerClick(marker, node, rt)` | 桥接标记 `click` 事件 |

地图场景脚本示例（含数据图层绑定）：

```gdscript
when map.load:
    map.set_center([116.39, 39.9], 12)

when sensor.click:
    sensor.highlight()
    map.fly_to([116.39, 39.9], 16)

watch data.temperature:
    if value > 80:
        sensor_layer.set_color(color(255, 60, 60))
    else:
        sensor_layer.set_color(color(80, 180, 255))
```

---

## 11. 错误信息

错误信息面向初学者，使用中文，带行号/列号和示例：

```text
第 2 行第 5 列：if 的条件后面需要一个冒号 :，例如：

  if 温度 > 80:
```

```text
节点「door」未找到。请先用 registerNode("door", ...) 注册它。
```

---

## 12. 加密打包

编译后的脚本可加密为二进制 blob：

```bash
bds pack script.bds -k "a-production-key-at-least-16-chars"
```

二进制格式：

```text
[magic "BDS1" (4)] [IV (12)] [auth tag (16)] [ciphertext AES-256-GCM]
```

载荷：`{ version, nodeNames, code }`（节点名 + 编译后的 JS）。

浏览器侧通过 Web Crypto（AES-256-GCM + SHA-256 派生密钥）解密执行。`pack`、`encryptToBinary` 和 `decryptFromBinary` 必须显式接收至少 16 个字符的密钥；生产实现不提供内置默认密钥。

> 安全边界：混淆级保护。密钥在客户端，无法做到绝对不可逆向，只能提高门槛。
> 如需更强保护，走 WASM 后端（把关键逻辑编译进 WASM 二进制）。

---

## 13. 晋升层级

一门语言，三个可见深度（由编辑器/IDE 控制展示，非三门语言）：

- **Basic**：变量、判断、重复、函数、事件、简单节点、简单属性
- **Scene**：节点、场景、信号、数据绑定、动画、组件
- **Advanced**：import、async、type、component、await、模块、完整类型

---

## 14. 工具链

### Source Map

编译时生成 v3 source map（行级映射），把生成的 TypeScript 映射回 `.bds` 源码，浏览器调试器可显示源码、定位断点。

```bash
bds compile script.bds    # 输出 script.ts + script.ts.map
```

### WASM 后端

纯计算函数（仅含算术/比较/if/return/函数调用，不含节点访问与事件）可编译为真正的 WebAssembly 二进制：

```bash
bds wasm script.bds    # 输出 script.wasm + script.wat
```

```gdscript
func compute(x, y):
    return x * y + x
```

编译为 WAT → `.wasm` 二进制（机器码，无法读回源码）。这是比加密更彻底的代码保护方式，也是性能敏感模块的出路。

### IDE 语言服务

基于 Monaco Editor 提供：`.bds` 语法高亮、关键词自动补全（含中文说明与代码片段）、悬停中文解释。

---

## 15. 版本记录

- **v0.4** — 新增：source map（调试映射）、WASM 后端（纯计算函数 → .wasm）、Monaco IDE 语言服务
- **v0.3** — 新增：vec3 / color 内置类型函数、Babylon.js 适配器正式化、MapLibre 数据图层绑定
- **v0.2** — 新增：for...in 循环、数组字面量与索引访问、MapLibre GL JS 框架适配器
- **v0.1** — MVP：变量、if/else、repeat、func/return、when、节点访问、属性读写、表达式、bind、watch、every frame、animate

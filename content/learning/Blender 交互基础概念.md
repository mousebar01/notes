# Blender 交互概念笔记

这篇笔记集中整理选中项、活动项、原点、3D Cursor、吸附、Operator 和 Context 等 Blender 交互基础概念。

## 一、核心状态

### 1. 选中项（Selected）

当前被选中的对象或元素，可以是多个。

```text
selected = {A, B, C}
```

在 Object Mode 中是对象，在 Edit Mode 中可以是顶点、边、面。

### 2. 活动项（Active）

当前上下文中的主要参考对象，通常是一个，并且通常属于选中项。

```text
selected = {A, B, C}
active = C
```

用途：

- 作为对齐目标；
- 作为 `Selection to Active` 的目标；
- 作为合并操作的主对象；
- 作为属性、修改器和多对象操作的参考。

源码概念：

```cpp
base->flag & BASE_SELECTED  // 选中状态
view_layer->basact           // 活动对象
```

注意：

> 最后点击的对象通常会成为活动对象，但不是绝对规则。选中状态和活动状态在源码中是分开保存的。

---

### 3. 原点（Object Origin）

每个对象自己的局部参考点，通常显示为对象上的橙色小点。

影响：

- Location；
- Rotation；
- Scale；
- 旋转和缩放中心；
- 父子关系中的局部坐标。

```text
Object Location = (0, 0, 0)
```

通常表示对象原点位于世界原点，但如果有父对象，则表示位于父对象的局部原点。

原点不一定位于模型几何中心。

---

### 4. 3D Cursor

场景级共享参考点，图标是红白圆环。

用途：

- 作为新建物体的位置；
- 作为旋转、缩放中心；
- 作为吸附目标；
- 设置对象原点；
- 进行精确定位。

常用操作：

```text
Shift + 右键     设置游标位置
Shift + S        打开 Snap 饼菜单
Shift + C        游标回到世界原点并调整视图
```

区别：

```text
Object Origin：属于某个对象
3D Cursor：属于场景，可被所有对象使用
```

---

## 二、`Shift + S` 吸附菜单

在 3D Viewport 中，`Shift + S` 打开 Snap 饼菜单。

```text
Cursor to Grid
```

游标移动到最近的网格位置。

```text
Selection to Grid
```

选中对象或编辑元素移动到最近的网格位置。

```text
Cursor to Selected
```

游标移动到所有选中项的中心。

```text
Selection to Cursor
```

选中项移动到游标位置，可能使多个对象重合。

```text
Selection to Cursor (Keep Offset)
```

选中项整体移动到游标，同时保持它们之间的相对距离。

```text
Selection to Active
```

其他选中项移动到活动项。

```text
Cursor to World Origin
```

游标移动到世界坐标 `(0, 0, 0)`。

```text
Cursor to Active
```

游标移动到活动对象的位置。

源码：

```text
scripts/startup/bl_ui/space_view3d.py
source/blender/editors/space_view3d/view3d_snap.cc
```

---

## 三、变换操作

Blender 常用变换快捷键：

```text
G  Grab / Move，移动
R  Rotate，旋转
S  Scale，缩放
```

`G` 来自早期术语 **Grab**，即“抓住并拖动”，后来界面名称统一为 Move，但快捷键保留。

变换语法：

```text
G X 2       沿 X 轴移动 2 个单位
R Z 90      绕 Z 轴旋转 90 度
S Shift Z 2 在 XY 平面缩放 2 倍
```

常见修饰键：

```text
Shift  精细控制或扩展操作
Ctrl   吸附、步进或特殊约束
Alt    清除、替代或辅助操作
```

这些只是一般规律，具体含义取决于当前 Operator 和上下文。

---

## 四、精确移动

### 鼠标精度

```text
G + Shift
```

让鼠标移动产生更细的变换增量。

### 步进吸附

```text
G + Ctrl
```

按网格或设定的增量吸附。

### 数字输入

```text
G X 2 Enter
```

直接指定精确数值，不依赖鼠标。

区别：

```text
Shift：鼠标控制更细
Ctrl：按固定增量吸附
数字：直接指定最终值
```

---

## 五、Operator

Operator 是 Blender 对“一个可执行操作”的统一抽象。

例如：

```text
TRANSFORM_OT_translate
```

可以被以下入口调用：

```text
快捷键 G
菜单
F3 搜索
Python bpy.ops
Gizmo
```

一个 Operator 可能包含：

```cpp
invoke  // 开始交互并准备状态
exec    // 直接执行
modal   // 持续处理鼠标和键盘事件
cancel  // 取消操作
poll    // 判断当前上下文是否允许执行
```

变换操作的基本流程：

```text
G
  -> invoke：初始化
  -> modal：处理鼠标、Shift、Ctrl、X
  -> Enter：确认
  -> Esc：取消
```

相关源码：

```text
source/blender/editors/transform/transform_ops.cc
source/blender/editors/transform/transform.cc
```

---

## 六、上下文（Context）

Blender 中同一个命令的行为可能取决于：

```text
当前编辑器
当前模式
当前选中项
当前活动项
当前视图
当前工具设置
```

例如同样按 `G`：

```text
Object Mode：移动整个对象
Edit Mode：移动顶点、边或面
Pose Mode：移动骨骼
```

因此学习 Blender 时要同时问：

```text
我在哪里？
我处于什么模式？
我选中了什么？
哪个是活动项？
这个命令修改了哪一层数据？
```

---

## 七、功能发现方式

不要只依赖记忆快捷键。

```text
F3                  搜索功能
偏好设置 > 键位映射  查询快捷键
鼠标悬停            查看 Tooltip
F9                  查看上一步操作的参数
菜单                查看命令和快捷键
Python Tooltips     查看界面对应的 Python 属性
```

推荐搜索策略：

```text
不知道功能名称：
用自然语言描述目标，让 AI 列出可能功能

知道功能名称：
用 F3 或手册搜索

想知道快捷键：
在键位映射中按名称搜索

想知道实现：
先找 Operator，再追踪源码
```

对，它们的区别在于：**是让每个选中项单独到游标，还是把整个选区作为一个整体移动到游标。**

## 例子

假设：

```text
A 在 X=1
B 在 X=3
3D Cursor 在 X=10
```

A 和 B 之间相距 `2`。

### Selection to Cursor

执行：

```text
Shift + S
Selection to Cursor
```

当前源码把它设置为：

```python
use_offset = False
```

结果通常是：

```text
A -> X=10
B -> X=10
```

两个对象会重合。

也就是：

```text
每个选中对象分别移动到游标
```

### Selection to Cursor (Keep Offset)

执行：

```text
Shift + S
Selection to Cursor (Keep Offset)
```

当前源码设置为：

```python
use_offset = True
```

结果可能是：

```text
A -> X=9
B -> X=11
```

它们整体移动到游标附近，但仍然保持：

```text
A 与 B 相距 2
```

也就是：

```text
先找到整个选区的变换中心
把这个中心移动到游标
所有对象一起移动相同距离
```

## 为什么叫 Keep Offset？

`Offset` 就是“相对偏移”。

```text
A 相对于选区中心偏移 -1
B 相对于选区中心偏移 +1
```

移动过程中保留这些偏移：

```text
A -> 游标 - 1
B -> 游标 + 1
```

## 活动项什么时候会影响结果？

如果当前 Pivot Point 使用：

```text
Median Point
```

整体中心通常是所有选中项的中位中心。

如果使用：

```text
Active Element
```

整体移动可能以活动对象作为参考中心。

所以完整关系是：

```text
Selection to Cursor
  -> 每个对象独立对齐
  -> 可能重合

Selection to Cursor (Keep Offset)
  -> 整个选区一起移动
  -> 保持对象之间的相对距离
  -> 可能使用 Median 或 Active 作为参考中心
```

源码中的关键注释：

[view3d_snap.cc:318](/home/sky/project/blender/source/blender/editors/space_view3d/view3d_snap.cc:318)

```cpp
Snaps the selection as a whole
or each selected object to the given location.
```

菜单则在：

[space_view3d.py:6227](/home/sky/project/blender/scripts/startup/bl_ui/space_view3d.py:6227)

分别传入：

```python
use_offset = False
use_offset = True
```

对于单个对象来说，这两个选项通常看不出区别；只有多个选中对象时，区别才明显。选中项目保持偏移和选中项到游标

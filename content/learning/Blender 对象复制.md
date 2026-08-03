# Blender 对象复制：独立复制与关联复制

这篇笔记从使用方式和源码实现两个角度，区分 `Shift + D` 的独立复制与 `Alt + D` 的关联复制。

你说的两种情况更准确地叫：

```text
独立复制（Duplicate）
关联复制 / 链接复制（Linked Duplicate）
```

它们都不是“镜像”。镜像通常指 Mirror Modifier 或镜像几何。

## 1. 独立复制：`Shift + D`

执行：

```text
Shift + D
```

Blender 会创建：

```text
Object A'：新的 Object
Mesh A'：新的 Mesh 数据
```

关系是：

```text
Object A  -> Mesh A
Object A' -> Mesh A'
```

它们初始形状相同，但之后独立。

例如：

```text
复制 Cube
进入其中一个 Edit Mode
移动一个顶点
```

只有当前对象的形状改变。

## 2. 关联复制：`Alt + D`

执行：

```text
Alt + D
```

Blender 会创建：

```text
Object B：新的 Object
Mesh：仍然是同一个 Mesh 数据
```

关系是：

```text
Object A ─┐
          ├── Mesh 数据
Object B ─┘
```

这时：

- 移动、旋转、缩放对象：互不影响；
- 修改 Mesh 几何：两个对象一起变化；
- 修改某个对象的材质或对象变换：通常只影响该对象。

## 为什么 Object 仍然不同？

即使共享 Mesh，两个 Object 仍然可以有不同的：

```text
Location
Rotation
Scale
Origin
Parent
Collection
```

所以可以把它理解成：

```text
Object：摆放方式
Mesh：几何内容
```

## 三种概念要区分

```text
Shift + D
  独立复制 Object 和 Mesh

Alt + D
  复制 Object，但共享 Mesh

Mirror Modifier
  根据镜像轴生成对称几何
```

镜像不是共享数据，而是一种几何生成方式。

## Python 中的对应关系

共享 Mesh：

```python
new_obj = obj.copy()
```

这通常复制 Object，但仍引用原来的 `obj.data`。

独立 Mesh：

```python
new_obj = obj.copy()
new_obj.data = obj.data.copy()
```

这样才是：

```text
新的 Object
新的 Mesh
```

这正是 Blender 数据块设计的重要部分：

```text
Object 可以共享 Mesh
多个 Object 可以引用同一个数据块
```

因此你刚才的理解可以修正为：

```text
一种是复制对象并复制数据
一种是复制对象但共享数据
```

而不是“镜像”和“复制值”。

我们来看这两个快捷键的源码路径。

## 1. 快捷键先映射到两个不同的宏 Operator

当前默认键位定义：

[scripts/presets/keyconfig/keymap_data/blender_default.py:4591](/home/sky/project/blender/scripts/presets/keyconfig/keymap_data/blender_default.py:4591)

```python
object.duplicate_move       Shift + D
object.duplicate_move_linked Alt + D
```

它们在 C++ 中注册为两个宏：

[object_ops.cc:306](/home/sky/project/blender/source/blender/editors/object/object_ops.cc:306)

```cpp
OBJECT_OT_duplicate_move
```

实际由两个步骤组成：

```text
OBJECT_OT_duplicate
TRANSFORM_OT_translate
```

所以：

```text
Shift + D
  -> 创建副本
  -> 进入移动状态

Alt + D
  -> 创建关联副本
  -> 进入移动状态
```

这说明 Blender 的“复制并移动”不是一个巨大函数，而是把：

```text
复制
+
移动
```

组合成一个宏 Operator。

## 2. 两者的关键差异是 `linked`

普通复制宏：

[object_ops.cc:306](/home/sky/project/blender/source/blender/editors/object/object_ops.cc:306)

```cpp
WM_operatortype_macro_define(ot, "OBJECT_OT_duplicate");
```

关联复制宏：

[object_ops.cc:317](/home/sky/project/blender/source/blender/editors/object/object_ops.cc:317)

```cpp
WM_operatortype_macro_define(ot, "OBJECT_OT_duplicate");
RNA_boolean_set(otmacro->ptr, "linked", true);
```

也就是说，`Alt+D` 只是给同一个复制 Operator 传入：

```text
linked = true
```

## 3. `linked` 如何影响数据复制？

复制 Operator 中：

[object_add.cc:5068](/home/sky/project/blender/source/blender/editors/object/object_add.cc:5068)

```cpp
const eDupli_ID_Flags dupflag =
    (linked) ? eDupli_ID_Flags{} : eDupli_ID_Flags(U.dupflag);
```

因此：

```text
Alt + D:
dupflag = 0

Shift + D:
dupflag = U.dupflag
```

源码定义明确写着：

[DNA_userdef_enums.h:20](/home/sky/project/blender/source/blender/makesdna/DNA_userdef_enums.h:20)

```cpp
If #eDupli_ID_Flags is 0 then no data will be copied (linked duplicate).
```

## 4. 最终的数据关系

### `Shift + D`

```text
Object A -> Mesh A
Object B -> Mesh B
```

创建了新的 Object，也复制了 Mesh 数据。

修改 B 的顶点：

```text
只影响 B
```

### `Alt + D`

```text
Object A ─┐
          ├── Mesh A
Object B ─┘
```

创建了新的 Object，但两个对象共享同一个 Mesh。

修改 B 的顶点：

```text
A 和 B 一起变化
```

但它们的这些属性仍然独立：

```text
Location
Rotation
Scale
Object Origin
Parent
Collection
```

## 5. Blender 不是简单地复制所有数据

`Shift+D` 使用的是：

```cpp
U.dupflag
```

它是一组复制标志，例如：

```cpp
USER_DUP_MESH
USER_DUP_CURVE
USER_DUP_MAT
USER_DUP_ARM
```

所以 Blender 可以分别决定：

```text
Mesh 是否复制
Material 是否复制
Armature 是否复制
Particle System 是否复制
```

这就是 Blender 数据块设计的核心：

```text
Object 是场景中的实例
Mesh 是可被多个 Object 引用的数据块
```

你可以在 Python Console 中验证：

```python
a = bpy.context.active_object
b = bpy.context.selected_objects[0]

a.data == b.data
```

如果结果是：

```python
True
```

说明两个对象共享同一个数据块。

这次源码阅读最值得记住的是：

```text
Shift+D 和 Alt+D 不是两套复制系统
它们共享 OBJECT_OT_duplicate
区别只是 linked 参数
linked 决定 dupflag
dupflag 决定数据块是否复制
```

这就是 Blender 很典型的设计：**用一个通用 Operator，加少量参数，表达不同的用户操作。**

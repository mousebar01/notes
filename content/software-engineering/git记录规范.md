可以，最实用的写法就是：

```text
type(scope): 中文说明
```

例如：

```text
feat(rag): 新增资源库检索功能
fix(markdown): 修复预览页面重复打开的问题
docs(resource): 补充资源库使用文档
refactor(agent): 重构工具调用流程
```

英文主要放在 **type 和 scope**，具体改了什么用中文写。这样既规范，又比全英文更容易扫一眼看懂。

常用类型：

```text
feat      新功能
fix       修复问题
docs      文档修改
refactor  重构，不改变功能
perf      性能优化
test      测试相关
style     格式、样式调整
chore     构建、依赖、配置、杂项
build     构建系统修改
ci        CI/CD 修改
revert    回滚提交
```

结合你这个项目，可以写成：

```text
feat(resource-library): 新增资源库创建与资料上传
feat(rag): 支持从资源库召回相关证据
docs(rag): 补充 RAG 与资源检索使用说明
fix(resource-library): 修复重命名后关联失效的问题
test(settings): 补充设置页面单元测试
chore(gitignore): 忽略本地运行产生的缓存文件
```

## 推荐规范

提交标题尽量描述“做了什么”，不要写过程或模糊词。

不太好：

```text
feat: 更新一下
fix: 修复bug
chore: 修改代码
```

更好：

```text
feat(rag): 支持视频时间点引用
fix(upload): 修复中文文件名上传失败
refactor(search): 统一资源检索结果结构
```

一次提交只做一类事情。比如既加功能又改文档，最好拆成：

```text
feat(rag): 新增图片内容检索
docs(rag): 补充图片检索配置说明
```

如果改动很小，也不用强行写 scope：

```text
docs: 更新项目启动说明
chore: 升级前端依赖
```

## 中英文混合的最佳平衡

我推荐你固定成这一套：

```text
英文类型(英文模块名): 中文动作 + 中文对象
```

例如：

```text
feat(agent): 新增联网搜索证据源
fix(chat): 修复流式消息重复渲染
refactor(rag): 拆分索引与召回逻辑
docs(resource-library): 完善资源库操作指南
```

模块名保持英文，是因为它通常对应代码目录、功能名或 package；说明用中文，是为了阅读效率。

你截图里这些改动，大概可以这样提交：

```text
docs(rag): 新增 RAG 与资料检索使用说明
docs(resource-library): 新增资源库使用文档
test(settings): 更新设置页面测试
chore(gitignore): 调整 Git 忽略规则
```

或者这些本来就是同一次文档完善，也可以合并为：

```text
docs: 补充 RAG 与资源库使用文档
```

核心原则就一句：**英文负责分类，中文负责把改动说清楚。**

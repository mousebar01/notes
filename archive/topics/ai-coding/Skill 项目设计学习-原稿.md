# Skill 项目设计学习

参考项目：https://github.com/mattpocock/skills/tree/main
这是一个比较经典的项目
思路是skill之间的编排和复用，然后skill是怎么安装和被使用的
组合和继承关系

一个标准的skill包含以下几点
1.明确的表述，分成两类，一类是模型自动调用，需要写清楚什么时候调用 use when 
另一类是只允许手动调用，/xxx去调用，
2.流程类skill需要表述清楚顺序，以及skill之间可以组合，/grill xxx是，调用/xxx
方法类的skill，
3.明确可执行的动作，什么可以做，方便大模型去tool_calling
4.验收标准，需要明确给出产物的格式和标准
5.长内容拆分成 reference 请根据[xxx.md]和[xxx.md]执行，验收标准[xxx.md]

如果skill很长可以拆分成format.md skill.md example.md
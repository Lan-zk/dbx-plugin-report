# 交接（handoff）

跨会话交接文档。每个文件记录某次会话结束时的**准确状态**：做到哪、卡在什么决策、下一步按什么顺序做、有哪些坑。

- 不是规格、不是计划：范围与轮次见 [../development/delivery-plan.md](../development/delivery-plan.md)，原型结论见 [../development/prototype.md](../development/prototype.md)。
- 一次会话一份，文件名 `<date>-<from>-to-<to>.md`，比如 `2026-10-22-p0-to-m0.md`。
- 新会话开始时先读最新一份，再读它指向的文档；不要在本目录复述规格内容。

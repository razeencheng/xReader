# xReader Context

xReader aggregates articles into a reading queue and helps readers triage, understand, and revisit them.

## Reading queue

**已读**:
An article state meaning the reader has handled the article and it may leave the unread queue. It does not assert that the full article was read.
_Avoid_: 阅读完成, 读完

**已读并下一篇**:
A compound action that marks the current article as read and opens the next article in the active reading queue.
_Avoid_: 下一篇, 读完并继续

## One-handed operation

**单手操作侧**:
A reader preference indicating whether thumb-reachable controls use the left or right edge in compact layouts. It changes the control layer, not content order or the reader's biological handedness.
_Avoid_: 惯用手, 整页镜像, 左手模式, 右手模式

**操作边**:
The physical screen edge selected by the single-hand operation side. Edge-anchored control groups and their overlays use this edge without reversing their internal order or directional meaning.
_Avoid_: 布局方向, 文本方向, RTL

## AI summary

**结构化摘要**:
An article summary consisting of one main-point sentence followed by two to four short, non-redundant key points.
_Avoid_: 单段摘要, 大段摘要

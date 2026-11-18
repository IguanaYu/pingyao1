# 演示版资产说明

本批从现有城隍庙场景 v03 提取主轴院落，保留蓝袍发髻小人外形，给小人增加可在 Cocos 中驱动的分件枢轴。原模型及原 Blender 文件未修改。

## 运行时资源

- `../client/assets/resources/models/temple/temple.gltf` 与 `temple.bin`：22 个建筑／器物模块，257,766 三角面，glTF 场景名 `Temple`。包含牌坊、山门、戏楼、钟鼓亭、中院、献殿、城隍正殿及侧廊背景；省略东西侧院和后院细节。
- `../client/assets/resources/models/visitor/visitor.gltf` 与 `visitor.bin`：原小人 28 个网格、9,482 三角面，glTF 场景名 `Visitor`。外形和纯色材质沿用原资产，新增空节点层级用于动作。
- `../shared/scene.json`：客户端和服务端共用的演示范围、地面、高台、坡面、44 个简化障碍、互动站位及物件放置位置。

资源采用米制，Y 向上、北向 -Z；小人在 yaw=0 时面向 +Z。glTF 和同目录 `.bin` 必须一起保留。源材质均为颜色材质，没有新增照片贴图或在线资源依赖。

演示路线在献殿后沿增加一段运行时生成的五级窄石阶，将 z=-15.45、y=.94 的台面连续接到原正殿台阶 z=-16.30、y=.51 处。共用场景数据的 `xiandian-rear-connector` 描述连续可走坡面，`connectionSteps` 描述五块同色可见石阶；客户端和服务器高度均取覆盖表面的最大值。这是为演示通行补充的游戏适配，不修改原建筑模型，也不作为实物测绘结构。

## 小人动画接口

完整层级和静止位置见 `visitor_rig.json`。Cocos 运行时按节点名寻找并插值角度即可，不依赖骨骼插件。

| 节点 | 局部静止位置 | 用途 |
|---|---|---|
| `Torso` | (0, .46, 0) | 躬身和坐姿的上身高度 |
| `Arm_L` / `Arm_R` | (-/+.14, .16, 0)，父为 Torso | 抬臂、持香、托物 |
| `HandSocket_L` / `HandSocket_R` | (-/+.085, -.235, .014)，父为对应手臂 | 将香束或小物件附到掌部 |
| `HeadPivot` | (0, .233, 0)，父为 Torso | 点头或轻微转头 |
| `Leg_L` / `Leg_R` | (-/+.073, .30, 0)，父为 VisitorRig | 行走摆腿、坐下向前伸腿 |
| `RobePivot` | (0, 0, 0)，父为 Torso | 坐姿适度缩短衣摆，避免穿过坐垫 |

glTF/Cocos 下抬臂使用负 X 角度；上身前倾使用正 X 角度。建议角度在 `visitor_rig.json` 中，实际游戏动作由客户端脚本随时间插值，并结合手持物调整。

## 可编辑来源与预览

- `temple_demo.blend`、`visitor_demo.blend` 是本批导出对应的可编辑源文件，`EXPORT` 集合仅包含资源本体。
- `prepare_assets.py` 可用 Blender 4.2 重新导出；依赖工作区原始 `城隍庙场景_v03/模型` 两个 GLB。
- 随交付包独立重建资源时使用 `export_blends.py`：它只读取同目录的 `temple_demo.blend`、`visitor_demo.blend`，导出各自 `EXPORT` 集合到客户端资源目录，不需要原工作区。命令为 `blender --background --python asset-work/export_blends.py`。导出后重新构建 Cocos 网页。
- `preview_poses.py` 仅渲染建议姿态，不改运行时资产。
- `previews/` 包含院落构图、小人正侧背面及持物、礼敬、坐姿的真实模型渲染。
- `asset-report.json` 记录模块和三角面数量。

已检查 glTF 导出、外部二进制文件和 Blender 预览。Cocos 导入、运行光照和动作观感以客户端演示检查为准。本批未做几十人手机性能认证。

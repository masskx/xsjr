// Milestones for the home-page timeline "人工智能简史". Kept to well-documented events with their
// commonly cited year; each line names the people or paper involved so it can be checked.

export interface Era {
  key: string;
  name: string;
  span: string;
  /** css colour for the era wash */
  tone: "gold" | "zinc" | "patina" | "ink" | "vermilion";
}

export interface Milestone {
  year: string;
  title: string;
  note: string;
  era: string;
  /** a defining moment: drawn larger */
  major?: boolean;
}

export const ERAS: Era[] = [
  { key: "dawn", name: "萌芽", span: "1943—1956", tone: "gold" },
  { key: "symbolic", name: "符号主义与第一次寒冬", span: "1956—1980", tone: "zinc" },
  { key: "connect", name: "专家系统与连接主义", span: "1980—2006", tone: "patina" },
  { key: "deep", name: "深度学习", span: "2006—2017", tone: "ink" },
  { key: "llm", name: "大模型与智能体", span: "2017—今", tone: "vermilion" },
];

export const MILESTONES: Milestone[] = [
  { year: "1943", era: "dawn", title: "第一个神经元数学模型", note: "McCulloch 与 Pitts 用逻辑电路描述神经元，人工神经网络的起点。" },
  { year: "1950", era: "dawn", title: "图灵测试", note: "图灵发表《计算机器与智能》，提出“机器能思考吗？”与模仿游戏。", major: true },
  { year: "1956", era: "symbolic", title: "达特茅斯会议", note: "麦卡锡等人在达特茅斯召集研讨会，“人工智能”一词正式诞生。", major: true },
  { year: "1958", era: "symbolic", title: "感知机", note: "Rosenblatt 提出可学习的感知机，第一次让机器从数据中学会分类。" },
  { year: "1966", era: "symbolic", title: "ELIZA", note: "Weizenbaum 的 ELIZA 用模式匹配“对话”，最早的聊天程序之一。" },
  { year: "1969", era: "symbolic", title: "《感知机》与寒冬", note: "Minsky 与 Papert 指出单层感知机的局限，神经网络研究随后陷入低谷。" },
  { year: "1980", era: "connect", title: "专家系统兴起", note: "XCON 等基于规则的专家系统进入工业应用，知识工程盛行。" },
  { year: "1986", era: "connect", title: "反向传播", note: "Rumelhart、Hinton、Williams 在 Nature 发表反向传播，多层网络得以训练。", major: true },
  { year: "1997", era: "connect", title: "深蓝与 LSTM", note: "IBM 深蓝战胜卡斯帕罗夫；同年 Hochreiter 与 Schmidhuber 提出 LSTM。" },
  { year: "1998", era: "connect", title: "LeNet-5", note: "LeCun 等人的卷积网络识别手写数字，卷积神经网络走向实用。" },
  { year: "2006", era: "deep", title: "深度学习复兴", note: "Hinton 等提出深度信念网络的逐层预训练，“深度学习”重新被重视。" },
  { year: "2009", era: "deep", title: "ImageNet", note: "邓嘉、李飞飞等发布 ImageNet 数据集，大规模视觉识别有了公共标尺。" },
  { year: "2012", era: "deep", title: "AlexNet", note: "Krizhevsky、Sutskever、Hinton 用 GPU 训练的 CNN 大幅刷新 ImageNet 成绩。", major: true },
  { year: "2014", era: "deep", title: "生成对抗网络", note: "Goodfellow 等提出 GAN，生成模型进入快车道。" },
  { year: "2016", era: "deep", title: "AlphaGo", note: "DeepMind 的 AlphaGo 以 4:1 战胜李世石，深度强化学习举世瞩目。" },
  { year: "2017", era: "llm", title: "Transformer", note: "Vaswani 等发表《Attention Is All You Need》，此后大模型几乎都基于它。", major: true },
  { year: "2018", era: "llm", title: "BERT 与 GPT", note: "预训练 + 微调成为自然语言处理的新范式。" },
  { year: "2020", era: "llm", title: "GPT-3 与 AlphaFold 2", note: "1750 亿参数的 GPT-3 展示少样本学习；AlphaFold 2 在 CASP14 解决蛋白质结构预测难题。" },
  { year: "2022", era: "llm", title: "ChatGPT", note: "对话式大模型走向大众，AI 辅助写作与编程迅速普及。", major: true },
  { year: "2024", era: "llm", title: "AI 获诺贝尔奖", note: "Hopfield 与 Hinton 获物理学奖；Hassabis、Jumper 与 Baker 获化学奖。" },
  { year: "2025", era: "llm", title: "推理模型与智能体", note: "开源推理模型普及，Agent Skills 成为开放标准，AI 开始按技能包完成科研流程。" },
];

// External aggregated search: a plain configuration table of engines and URL templates. The
// query is URL-encoded into {q} and the engine opens in a new tab. Nothing is fetched, proxied,
// scraped or rendered from third-party sites.
//
// To add an engine: append { name, url } with {q} where the query goes. Check the template by
// searching on the site itself and copying the result URL.

export interface Engine {
  name: string;
  url: string;
}
export interface SearchMode {
  key: string;
  label: string;
  placeholder: string;
  engines: Engine[];
}

export const SEARCH_MODES: SearchMode[] = [
  {
    key: "web",
    label: "综合搜索",
    placeholder: "搜索网页",
    engines: [
      { name: "百度", url: "https://www.baidu.com/s?wd={q}" },
      { name: "必应", url: "https://cn.bing.com/search?q={q}" },
      { name: "Google", url: "https://www.google.com/search?q={q}" },
      { name: "搜狗", url: "https://www.sogou.com/web?query={q}" },
    ],
  },
  {
    key: "cn-lit",
    label: "中文文献",
    placeholder: "论文标题、关键词或作者",
    engines: [
      { name: "知网", url: "https://kns.cnki.net/kns8s/defaultresult/index?korder=&kw={q}" },
      { name: "万方", url: "https://s.wanfangdata.com.cn/paper?q={q}" },
      { name: "维普", url: "https://www.cqvip.com/search?k={q}" },
      { name: "百度学术", url: "https://xueshu.baidu.com/s?wd={q}" },
    ],
  },
  {
    key: "en-lit",
    label: "英文文献",
    placeholder: "Title, keywords, DOI or author",
    engines: [
      { name: "Google Scholar", url: "https://scholar.google.com/scholar?hl=zh-CN&q={q}" },
      { name: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov/?term={q}" },
      { name: "必应学术", url: "https://cn.bing.com/academic/search?q={q}" },
      { name: "arXiv", url: "https://arxiv.org/search/?query={q}&searchtype=all" },
      { name: "Semantic Scholar", url: "https://www.semanticscholar.org/search?q={q}" },
      { name: "ScienceDirect", url: "https://www.sciencedirect.com/search?qs={q}" },
      { name: "IEEE Xplore", url: "https://ieeexplore.ieee.org/search/searchresult.jsp?newsearch=true&queryText={q}" },
      { name: "Springer", url: "https://link.springer.com/search?query={q}" },
    ],
  },
  {
    key: "patent",
    label: "专利检索",
    placeholder: "专利名称、申请人或技术关键词",
    engines: [
      { name: "万方专利", url: "https://s.wanfangdata.com.cn/patent?q={q}" },
      { name: "Google Patents", url: "https://patents.google.com/?q={q}" },
      { name: "Espacenet", url: "https://worldwide.espacenet.com/patent/search?q={q}" },
    ],
  },
  {
    key: "journal",
    label: "期刊检索",
    placeholder: "期刊名称或 ISSN",
    engines: [
      { name: "LetPub", url: "https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchsort=relevance&searchname={q}" },
      { name: "知网期刊", url: "https://navi.cnki.net/knavi/journals/search?uniplatform=NZKPT&language=CHS&q={q}" },
      { name: "万方期刊", url: "https://s.wanfangdata.com.cn/magazine?q={q}" },
      { name: "维普期刊", url: "https://www.cqvip.com/journal/search?k={q}" },
      { name: "SCImago", url: "https://www.scimagojr.com/journalsearch.php?q={q}" },
    ],
  },
  {
    key: "social",
    label: "自媒体",
    placeholder: "公众号文章、视频或讨论",
    engines: [
      { name: "微信公众号", url: "https://weixin.sogou.com/weixin?type=2&query={q}" },
      { name: "哔哩哔哩", url: "https://search.bilibili.com/all?keyword={q}" },
      { name: "知乎", url: "https://www.zhihu.com/search?type=content&q={q}" },
      { name: "微博", url: "https://s.weibo.com/weibo?q={q}" },
      { name: "小红书", url: "https://www.xiaohongshu.com/search_result?keyword={q}" },
      { name: "抖音", url: "https://www.douyin.com/search/{q}" },
    ],
  },
  {
    key: "translate",
    label: "中英互译",
    placeholder: "输入要翻译的中文或英文",
    engines: [
      { name: "百度翻译", url: "https://fanyi.baidu.com/mtpe-individual/transText?query={q}" },
      { name: "有道翻译", url: "https://www.youdao.com/result?word={q}&lang=en" },
      { name: "搜狗翻译", url: "https://fanyi.sogou.com/text?keyword={q}" },
      { name: "DeepL", url: "https://www.deepl.com/translator#zh/en/{q}" },
      { name: "Google 翻译", url: "https://translate.google.com/?sl=auto&tl=en&text={q}&op=translate" },
    ],
  },
];

export function buildSearchUrl(template: string, query: string): string {
  return template.replace("{q}", encodeURIComponent(query.trim()));
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { targetUrl, persona } = req.body || {};
    if (!targetUrl) return res.status(400).json({ error: 'URL is required' });

    // Webページのテキスト取得
    const jinaRes = await fetch('https://r.jina.ai/' + targetUrl);
    if (!jinaRes.ok) throw new Error('Webサイトのテキスト取得に失敗しました');
    const websiteText = await jinaRes.text();

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY が設定されていません');

    const promptText = `あなたは『${persona || '20代〜30代の一般消費者（スマホメイン・直感重視）'}』です。
以下に提供されるWebサイトのテキスト情報を、スマホ画面で3秒〜10秒程度サッと流し読みした顧客になりきって評価してください。

【対象Webサイトのテキスト情報】
${websiteText.slice(0, 4000)}

【出力フォーマット】
■ 第一印象（3秒で感じたこと）:
・一目で何のサイトか分かったか、自分向けだと思えたか直感的な感想。

■ 生々しい離脱理由:
・どの文章や情報を見た時に「めんどくさい」「よく分からない」「高そう/怪しい」と感じてページを閉じそうになったか。

■ プロの改善提案:
1. 【キャッチコピー書き換え案】
・現状の課題：
・修正案：
2. 【今すぐできるコンバージョン率UPのアクション】
・ボタン文字の変更や、追加すべき補足情報の具体的指示。`;

    // Groq API 呼び出し
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: promptText }]
      })
    });

    const groqData = await groqRes.json();

    if (!groqRes.ok) {
      throw new Error(groqData.error?.message || 'Groq APIエラー');
    }

    const responseText = groqData.choices?.[0]?.message?.content;
    return res.status(200).json({ analysis: responseText });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error.message || 'Unknown error' 
    });
  }
};

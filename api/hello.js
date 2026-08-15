module.exports = async function (req, res) {
  // CORSヘッダーの設定
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = req.body || {};
    const { targetUrl, persona } = body;

    if (!targetUrl) return res.status(400).json({ error: 'URL is required' });

    // Jina AI でWebページのテキストを取得
    const jinaResponse = await fetch('https://r.jina.ai/' + targetUrl);
    if (!jinaResponse.ok) throw new Error('Webサイトのテキスト取得に失敗しました');
    const websiteText = await jinaResponse.text();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');

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

    // 利用可能なモデルを順番に試すリスト
    const modelsToTry = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
    let lastErrorMessage = '';

    for (const modelName of modelsToTry) {
      try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        });

        const geminiData = await geminiRes.json();
        
        // 成功したらその結果を返して終了
        if (geminiRes.ok && geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
          return res.status(200).json({ analysis: geminiData.candidates[0].content.parts[0].text });
        }
        
        lastErrorMessage = geminiData.error?.message || 'API呼び出し失敗';
      } catch (e) {
        lastErrorMessage = e.message;
      }
    }

    // 全てのモデルで失敗した場合のみエラーを投げる
    throw new Error(lastErrorMessage || '全てのGeminiモデルの呼び出しに失敗しました');

  } catch (error) {
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error.message || 'Unknown error' 
    });
  }
};

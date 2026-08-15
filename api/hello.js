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

    // 1. APIキーで現在利用可能なモデル一覧をGoogleから直接取得
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const listData = await listRes.json();

    if (!listRes.ok) {
      throw new Error(listData.error?.message || 'モデル一覧の取得に失敗しました。GEMINI_API_KEYを確認してください。');
    }

    // 文章生成に対応している利用可能なモデル（gemini-2.0-flash など）を自動検出
    const validModel = listData.models?.find(m => 
      m.supportedGenerationMethods?.includes('generateContent')
    );

    const modelPath = validModel ? validModel.name : 'models/gemini-2.0-flash';

    // 2. 検出されたモデルを使ってリクエスト送信
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      })
    });

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      throw new Error(geminiData.error?.message || `${modelPath} の呼び出しに失敗しました`);
    }

    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error('Geminiからの応答テキスト取得に失敗しました');
    }

    return res.status(200).json({ analysis: responseText });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error.message || 'Unknown error' 
    });
  }
};

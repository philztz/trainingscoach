module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password } = req.body || {};
  const correct = process.env.APP_PASSWORD;

  if (!correct) return res.status(500).json({ error: "APP_PASSWORD not configured" });
  if (!password || password !== correct) return res.status(401).json({ error: "Falsches Passwort" });

  // Return a simple session token (timestamp-based, expires in 30 days)
  const token = Buffer.from(`tc_${Date.now()}_${correct.length}`).toString("base64");
  res.json({ token, expires: Date.now() + 30 * 24 * 60 * 60 * 1000 });
};

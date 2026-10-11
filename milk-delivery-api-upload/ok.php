<?php
header('Content-Type: application/json; charset=utf-8');
http_response_code(200);
echo json_encode([
  'ok' => true,
  'php' => PHP_VERSION,
  'message' => 'API folder is live. Next open /health after you create .env',
], JSON_UNESCAPED_SLASHES);

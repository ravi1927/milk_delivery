<?php
declare(strict_types=1);

/**
 * Milk Delivery Management REST API.
 * PHP 8.1+, PDO MySQL. Put this folder behind HTTPS in production.
 */
// Optional local .env loader. Keep .env outside public web root where possible.
// Values are stored in $APP_ENV because some shared hosts disable putenv().
$APP_ENV = [];
$envFile = __DIR__ . '/.env';
if (is_file($envFile) && is_readable($envFile)) {
  foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $line=trim($line);
    if ($line==='' || str_starts_with($line,'#') || !str_contains($line,'=')) continue;
    [$key,$value]=explode('=',$line,2);
    $key=trim($key);
    $value=trim($value);
    $value=trim($value, "\"'");
    if ($key==='') continue;
    $APP_ENV[$key]=$value;
    if (getenv($key)===false) @putenv($key.'='.$value);
  }
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . (getenv('CORS_ORIGIN') ?: ($APP_ENV['CORS_ORIGIN'] ?? '*')));
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Authorization, X-API-Key, X-Hub-Signature-256');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function out(int $status, array $body): never { http_response_code($status); echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function body(): array { $v=json_decode(file_get_contents('php://input'), true); return is_array($v) ? $v : []; }
function bearerToken(array $input = []): string {
  $candidates = [
    $_SERVER['HTTP_AUTHORIZATION'] ?? '',
    $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '',
    $_SERVER['HTTP_X_AUTHORIZATION'] ?? '',
    $_GET['access_token'] ?? '',
    $_GET['token'] ?? '',
    $input['access_token'] ?? '',
    $input['token'] ?? '',
  ];
  if (function_exists('apache_request_headers')) {
    $h = apache_request_headers();
    foreach (['Authorization', 'X-Authorization'] as $key) {
      if (!empty($h[$key])) $candidates[] = $h[$key];
      foreach ($h as $k => $v) if (strcasecmp((string)$k, $key) === 0 && $v) $candidates[] = $v;
    }
  }
  foreach ($candidates as $raw) {
    $token = trim(preg_replace('/^Bearer\s+/i', '', (string)$raw));
    if ($token !== '') return $token;
  }
  return '';
}
function envv(string $key, string $default=''): string {
  global $APP_ENV;
  if (array_key_exists($key, $APP_ENV) && $APP_ENV[$key] !== '') return (string)$APP_ENV[$key];
  $g = getenv($key);
  return $g !== false ? (string)$g : $default;
}
function sameId($a, $b): bool {
  if ($a===null || $b===null || $a==='' || $b==='') return false;
  return (string)$a === (string)$b;
}
function tableExists(PDO $pdo, string $table): bool {
  $q=$pdo->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1');
  $q->execute([$table]);
  return (bool)$q->fetchColumn();
}
function columnExists(PDO $pdo, string $table, string $column): bool {
  $q=$pdo->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1');
  $q->execute([$table,$column]);
  return (bool)$q->fetchColumn();
}
function usersHaveCustomerLink(PDO $pdo): bool {
  try {
    $col=$pdo->query("SHOW COLUMNS FROM users LIKE 'customer_record_id'")->fetch();
    return is_array($col);
  } catch (Throwable $e) { return false; }
}
function customerRoleReady(PDO $pdo): bool {
  try {
    if (!usersHaveCustomerLink($pdo)) return false;
    $col=$pdo->query("SHOW COLUMNS FROM users LIKE 'role'")->fetch();
    return str_contains(strtolower((string)($col['Type'] ?? '')), 'customer');
  } catch (Throwable $e) { return false; }
}
function isDuplicateKey(Throwable $e): bool {
  return str_contains(strtolower($e->getMessage()),'duplicate') || (string)$e->getCode()==='23000';
}
function customerIdsByLoginUser(PDO $pdo, bool $reset=false): array {
  static $map=null;
  if ($reset) { $map=null; return []; }
  if ($map!==null) return $map;
  $map=[];
  try {
    foreach ($pdo->query("SELECT record_id, payload FROM app_records WHERE resource='customers'") as $row) {
      $payload=json_decode((string)$row['payload'], true);
      $uid=is_array($payload) ? trim((string)($payload['loginUserId'] ?? '')) : '';
      if ($uid!=='') $map[$uid]=(string)$row['record_id'];
    }
  } catch (Throwable $e) {}
  return $map;
}
function rememberCustomerLogin(PDO $pdo, string $userId, string $customerRecordId): void {
  if ($userId==='' || $customerRecordId==='') return;
  $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='customers' AND record_id=?");
  $q->execute([$customerRecordId]);
  $row=$q->fetch();
  if (!$row) return;
  $payload=json_decode((string)$row['payload'], true);
  if (!is_array($payload)) $payload=['id'=>$customerRecordId];
  $payload['id']=$customerRecordId;
  $payload['loginUserId']=$userId;
  unset($payload['password'], $payload['password_hash'], $payload['email']);
  $pdo->prepare('UPDATE app_records SET payload=? WHERE resource=\'customers\' AND record_id=?')
    ->execute([json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), $customerRecordId]);
  customerIdsByLoginUser($pdo, true);
}
function ensureCustomerLoginSchema(PDO $pdo): void {
  static $done=false;
  if ($done) return;
  $done=true;
  try {
    $col=$pdo->query("SHOW COLUMNS FROM users LIKE 'role'")->fetch();
    $type=strtolower((string)($col['Type'] ?? ''));
    if ($type!=='' && !str_contains($type, 'customer')) {
      $pdo->exec("ALTER TABLE users MODIFY COLUMN role ENUM('admin','delivery','customer') NOT NULL");
    }
    if (!usersHaveCustomerLink($pdo)) {
      $pdo->exec('ALTER TABLE users ADD COLUMN customer_record_id VARCHAR(100) NULL');
      try { $pdo->exec('ALTER TABLE users ADD UNIQUE KEY uq_users_customer_record (customer_record_id)'); } catch (Throwable $e) {}
    }
  } catch (Throwable $e) { /* The DB user may not have ALTER. Customer login still uses the current columns. */ }
  try {
    if (!tableExists($pdo,'login')) {
      $pdo->exec("CREATE TABLE IF NOT EXISTS login (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(64) NULL,
        role ENUM('admin','delivery','customer') NULL,
        password_hash VARCHAR(255) NULL,
        success TINYINT(1) NOT NULL DEFAULT 0,
        event ENUM('signin','password') NOT NULL DEFAULT 'signin',
        signed_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_login_user (user_id),
        INDEX idx_login_signed (signed_in_at)
      ) ENGINE=InnoDB");
    }
  } catch (Throwable $e) {}
}
function publicUser(PDO $pdo, array $u): array {
  unset($u['password_hash']);
  $u['areaId']=$u['area_id'] ?? ($u['areaId'] ?? null);
  unset($u['area_id']);
  $u['customerRecordId']=$u['customer_record_id'] ?? ($u['customerRecordId'] ?? null);
  unset($u['customer_record_id']);
  if ($u['customerRecordId']==='') $u['customerRecordId']=null;
  $area=(string)($u['areaId'] ?? '');
  if (($u['customerRecordId']===null || $u['customerRecordId']==='') && str_starts_with($area, 'customer:')) {
    $u['customerRecordId']=substr($area, 9);
  }
  if ($u['customerRecordId']===null || $u['customerRecordId']==='') {
    $mapped=customerIdsByLoginUser($pdo)[(string)($u['id'] ?? '')] ?? '';
    if ($mapped!=='') $u['customerRecordId']=$mapped;
  }
  if (!empty($u['customerRecordId']) && ($u['role'] ?? '')!=='admin') $u['role']='customer';
  if (str_starts_with($area, 'customer:')) $u['areaId']=null;
  if (isset($u['active'])) $u['active']=(int)$u['active'];
  return $u;
}
function userAuthSelect(PDO $pdo): string {
  $link=usersHaveCustomerLink($pdo) ? 'customer_record_id' : 'NULL AS customer_record_id';
  return "id,name,email,password_hash,role,area_id,{$link},active";
}
function userPublicSelect(PDO $pdo): string {
  $link=usersHaveCustomerLink($pdo) ? 'customer_record_id AS customerRecordId' : 'NULL AS customerRecordId';
  return "id,name,email,role,area_id AS areaId,{$link},active";
}
function recordLogin(PDO $pdo, ?string $userId, ?string $role, ?string $passwordHash, bool $success): void {
  if (!tableExists($pdo,'login')) return;
  $q=$pdo->prepare('INSERT INTO login(user_id,role,password_hash,success,event,signed_in_at) VALUES(?,?,?,?,\'signin\',NOW())');
  $q->execute([$userId,$role,$passwordHash,$success?1:0]);
}
function mirrorLoginPassword(PDO $pdo, string $userId, string $role, string $hash): void {
  if (!tableExists($pdo,'login')) return;
  try {
    $pdo->prepare('UPDATE login SET password_hash=?, role=? WHERE user_id=?')->execute([$hash,$role,$userId]);
    $q=$pdo->prepare('SELECT id FROM login WHERE user_id=? LIMIT 1');
    $q->execute([$userId]);
    if (!$q->fetch()) {
      $pdo->prepare('INSERT INTO login(user_id,role,password_hash,success,event,signed_in_at) VALUES(?,?,?,0,\'password\',NOW())')->execute([$userId,$role,$hash]);
    }
  } catch (Throwable $e) { /* users.password_hash already saved; a missing login table must not undo it */ }
}
function insertUser(PDO $pdo, string $id, string $name, string $email, string $hash, string $role, ?string $areaId, ?string $customerRecordId): string {
  $hasLink=usersHaveCustomerLink($pdo);
  $run=function (?string $useId) use ($pdo,$name,$email,$hash,$role,$areaId,$customerRecordId,$hasLink): string {
    $pdo->beginTransaction();
    try {
      if ($useId!==null && $useId!=='') {
        if ($hasLink) {
          $pdo->prepare('INSERT INTO users(id,name,email,password_hash,role,area_id,customer_record_id) VALUES(?,?,?,?,?,?,?)')->execute([$useId,$name,$email,$hash,$role,$areaId,$customerRecordId]);
        } else {
          $pdo->prepare('INSERT INTO users(id,name,email,password_hash,role,area_id) VALUES(?,?,?,?,?,?)')->execute([$useId,$name,$email,$hash,$role,$areaId]);
        }
        $newId=$useId;
      } else {
        if ($hasLink) {
          $pdo->prepare('INSERT INTO users(name,email,password_hash,role,area_id,customer_record_id) VALUES(?,?,?,?,?,?)')->execute([$name,$email,$hash,$role,$areaId,$customerRecordId]);
        } else {
          $pdo->prepare('INSERT INTO users(name,email,password_hash,role,area_id) VALUES(?,?,?,?,?)')->execute([$name,$email,$hash,$role,$areaId]);
        }
        $newId=(string)$pdo->lastInsertId();
      }
      $pdo->commit();
      return $newId;
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      throw $e;
    }
  };
  try { return $run($id); }
  catch (Throwable $e) {
    if (isDuplicateKey($e)) throw $e;
    return $run(null);
  }
}
function customerStorage(PDO $pdo, string $role, ?string $areaId, ?string $linked): array {
  if ($role!=='customer') return ['role'=>$role,'area'=>$areaId,'link'=>null];
  ensureCustomerLoginSchema($pdo);
  $enumOk=false;
  try {
    $col=$pdo->query("SHOW COLUMNS FROM users LIKE 'role'")->fetch();
    $enumOk=str_contains(strtolower((string)($col['Type'] ?? '')), 'customer');
  } catch (Throwable $e) {}
  $marker='customer:'.(string)$linked;
  $markerArea=strlen($marker)<=64 ? $marker : null;
  if ($enumOk && usersHaveCustomerLink($pdo)) return ['role'=>'customer','area'=>null,'link'=>$linked];
  if ($enumOk) return ['role'=>'customer','area'=>$markerArea,'link'=>null];
  return ['role'=>'delivery','area'=>$markerArea,'link'=>null];
}
function customerRecordFrom(array $input): string {
  foreach (['customerRecordId','customer_record_id','customerId'] as $key) {
    if (isset($input[$key]) && trim((string)$input[$key])!=='') return trim((string)$input[$key]);
  }
  return '';
}
function skipKeySet(PDO $pdo): array {
  if (!tableExists($pdo,'skip_requests')) return [];
  $set=[];
  foreach ($pdo->query('SELECT customer_record_id, skip_date FROM skip_requests') as $row) {
    $day=substr((string)$row['skip_date'], 0, 10);
    $set[$day.'|'.(string)$row['customer_record_id']]=true;
  }
  return $set;
}
function hideSkippedDelivery(PDO $pdo, string $rid): void {
  $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='deliveries' AND record_id=?");
  $q->execute([$rid]);
  $row=$q->fetch();
  if (!$row) return;
  $old=json_decode((string)$row['payload'], true);
  if (is_array($old) && ($old['status'] ?? '')==='pending') {
    $pdo->prepare("DELETE FROM app_records WHERE resource='deliveries' AND record_id=?")->execute([$rid]);
  }
}
function mapSkip(array $r): array {
  $date=(string)($r['skip_date'] ?? '');
  if (strlen($date)>10) $date=substr($date,0,10);
  return [
    'id'=>$r['id'],
    'customerRecordId'=>$r['customer_record_id'],
    'date'=>$date,
    'reason'=>$r['reason'],
    'seen'=>(int)$r['seen'],
    'createdAt'=>$r['created_at'] ?? null,
  ];
}
function listSkips(PDO $pdo, ?string $customerRecordId): array {
  if (!tableExists($pdo,'skip_requests')) return [];
  if ($customerRecordId===null) {
    $rows=$pdo->query('SELECT id,customer_record_id,skip_date,reason,seen,created_at FROM skip_requests ORDER BY created_at DESC')->fetchAll();
  } else {
    $q=$pdo->prepare('SELECT id,customer_record_id,skip_date,reason,seen,created_at FROM skip_requests WHERE customer_record_id=? ORDER BY skip_date');
    $q->execute([$customerRecordId]);
    $rows=$q->fetchAll();
  }
  return array_map('mapSkip', $rows);
}
function proofDir(): string {
  $dir=__DIR__.'/uploads/proofs';
  if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    out(500, ['error'=>'Could not create the delivery photo folder']);
  }
  return $dir;
}
function imageExt(string $bytes): string {
  if (str_starts_with($bytes, "\xFF\xD8\xFF")) return 'jpg';
  if (str_starts_with($bytes, "\x89PNG\r\n\x1A\n")) return 'png';
  if (strlen($bytes)>=12 && str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4)==='WEBP') return 'webp';
  return '';
}
function requestOrigin(): string {
  $https=(!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')==='https');
  $host=$_SERVER['HTTP_HOST'] ?? 'localhost';
  $script=$_SERVER['SCRIPT_NAME'] ?? '/index.php';
  return ($https?'https':'http').'://'.$host.$script;
}
function saveProofFile(string $bytes): string {
  if ($bytes==='' || strlen($bytes)>5*1024*1024) out(422, ['error'=>'Photo must be a JPEG, PNG, or WebP image of 5 MB or smaller']);
  $ext=imageExt($bytes);
  if ($ext==='') out(422, ['error'=>'Upload a JPEG, PNG, or WebP image']);
  $name=bin2hex(random_bytes(16)).'.'.$ext;
  if (file_put_contents(proofDir().'/'.$name, $bytes)===false) out(500, ['error'=>'Could not store the delivery photo']);
  return $name;
}
function readProofBytes(array $input): string {
  if (!empty($_FILES['photo']['tmp_name']) && is_uploaded_file($_FILES['photo']['tmp_name'])) {
    if ((int)($_FILES['photo']['error'] ?? UPLOAD_ERR_OK)!==UPLOAD_ERR_OK) out(422, ['error'=>'Photo upload failed']);
    $bytes=file_get_contents($_FILES['photo']['tmp_name']);
    return $bytes===false ? '' : $bytes;
  }
  $b64=(string)($input['imageBase64'] ?? '');
  if (str_contains($b64, ',')) $b64=substr($b64, strpos($b64, ',')+1);
  if ($b64==='') return '';
  $bytes=base64_decode($b64, true);
  return $bytes===false ? '' : $bytes;
}
function storeDeliveryProof(PDO $pdo, array $user, string $deliveryId, string $bytes): array {
  if (!tableExists($pdo,'delivery_photos')) out(500, ['error'=>'delivery_photos is missing. Apply backend-php/migrations/2026-11-02-customer-login-photos-skips.sql']);
  $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='deliveries' AND record_id=?");
  $q->execute([$deliveryId]);
  $row=$q->fetch();
  if (!$row) out(404, ['error'=>'Delivery record not found']);
  $prior=json_decode((string)$row['payload'], true) ?: [];
  if (($user['role'] ?? '')!=='admin' && !sameId($prior['boyId'] ?? null, $user['id'] ?? null)) {
    out(403, ['error'=>'This delivery is not assigned to you']);
  }
  $name=saveProofFile($bytes);
  $now=date(DATE_ATOM);
  $ins=$pdo->prepare('INSERT INTO delivery_photos(delivery_id,stored_name,url,created_at) VALUES(?,?,?,NOW())');
  $ins->execute([$deliveryId,$name,'']);
  $photoId=(string)$pdo->lastInsertId();
  $url=requestOrigin().'/delivery-photos/'.$photoId;
  $pdo->prepare('UPDATE delivery_photos SET url=? WHERE id=?')->execute([$url,$photoId]);
  $record=array_merge($prior, [
    'status'=>'delivered',
    'proofUri'=>$url,
    'proofPhotoId'=>$photoId,
    'proofCreatedAt'=>$now,
    'deliveredAt'=>$now,
  ]);
  $pdo->prepare("UPDATE app_records SET payload=? WHERE resource='deliveries' AND record_id=?")
    ->execute([json_encode($record, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), $deliveryId]);
  return ['id'=>$photoId,'url'=>$url,'createdAt'=>$now,'item'=>$record];
}
function cleanupOldPhotos(PDO $pdo): array {
  if (!tableExists($pdo,'delivery_photos')) out(500, ['error'=>'delivery_photos is missing. Apply backend-php/migrations/2026-11-02-customer-login-photos-skips.sql']);
  $rows=$pdo->query('SELECT id, delivery_id, stored_name FROM delivery_photos WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)')->fetchAll();
  $dir=proofDir();
  $deleted=0;
  foreach ($rows as $row) {
    $name=basename((string)$row['stored_name']);
    $path=$dir.'/'.$name;
    if ($name!=='' && is_file($path)) @unlink($path);
    $dq=$pdo->prepare("SELECT payload FROM app_records WHERE resource='deliveries' AND record_id=?");
    $dq->execute([(string)$row['delivery_id']]);
    $rec=$dq->fetch();
    if ($rec) {
      $payload=json_decode((string)$rec['payload'], true);
      if (is_array($payload)) {
        $uri=(string)($payload['proofUri'] ?? '');
        $photoId=(string)($payload['proofPhotoId'] ?? '');
        if ($photoId===(string)$row['id'] || str_contains($uri, '/delivery-photos/'.$row['id']) || ($name!=='' && str_contains($uri, $name))) {
          $payload['proofUri']=null;
          $payload['proofPhotoId']=null;
          $pdo->prepare("UPDATE app_records SET payload=? WHERE resource='deliveries' AND record_id=?")
            ->execute([json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), (string)$row['delivery_id']]);
        }
      }
    }
    $pdo->prepare('DELETE FROM delivery_photos WHERE id=?')->execute([$row['id']]);
    $deleted++;
  }
  return ['deleted'=>$deleted, 'olderThanDays'=>30];
}
function servePhoto(PDO $pdo, array $user, string $photoId): never {
  if (!tableExists($pdo,'delivery_photos')) out(404, ['error'=>'Photo not found']);
  $q=$pdo->prepare('SELECT stored_name, delivery_id FROM delivery_photos WHERE id=?');
  $q->execute([$photoId]);
  $row=$q->fetch();
  if (!$row) out(404, ['error'=>'Photo not found']);
  $dq=$pdo->prepare("SELECT payload FROM app_records WHERE resource='deliveries' AND record_id=?");
  $dq->execute([(string)$row['delivery_id']]);
  $delivery=json_decode((string)($dq->fetch()['payload'] ?? 'null'), true);
  $allowed=($user['role'] ?? '')==='admin'
    || (is_array($delivery) && sameId($delivery['boyId'] ?? null, $user['id'] ?? null))
    || (($user['role'] ?? '')==='customer' && is_array($delivery) && (string)($delivery['customerId'] ?? '')===(string)($user['customerRecordId'] ?? ''));
  if (!$allowed) out(403, ['error'=>'You cannot view this photo']);
  $name=basename((string)$row['stored_name']);
  $path=proofDir().'/'.$name;
  if ($name==='' || !is_file($path)) out(404, ['error'=>'Photo file is no longer on the server']);
  $ext=strtolower(pathinfo($name, PATHINFO_EXTENSION));
  $type=$ext==='png' ? 'image/png' : ($ext==='webp' ? 'image/webp' : 'image/jpeg');
  header('Content-Type: '.$type);
  header('Content-Length: '.filesize($path));
  header('Cache-Control: private, max-age=86400');
  readfile($path);
  exit;
}

$method=$_SERVER['REQUEST_METHOD'];
$path=parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$info=(string)($_SERVER['PATH_INFO'] ?? '');
if ($info!=='' && !str_contains($path, $info)) $path=rtrim($path,'/').$info;
$path=preg_replace('#/+#','/',$path);
$path=preg_replace('#/index\.php#','',$path) ?: '/';
if ($path === '/api') $path='/'; elseif (str_starts_with($path, '/api/')) $path=substr($path, 4);
$input=body();

// Works even before the database is connected — use this to confirm the files are live.
if ($path === '/ping' || str_ends_with($path, '/ping')) {
  out(200, ['ok'=>true, 'service'=>'milk-delivery-api', 'php'=>PHP_VERSION]);
}

try {
  $pdo = new PDO(
    'mysql:host='.envv('DB_HOST','127.0.0.1').';port='.envv('DB_PORT','3306').';dbname='.envv('DB_NAME','milkDeliverymanagement').';charset=utf8mb4',
    envv('DB_USER','root'), envv('DB_PASSWORD',''),
    [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false]
  );
} catch (Throwable $e) { out(500, ['ok'=>false, 'error'=>'Database connection failed. Check .env DB_HOST, DB_NAME, DB_USER and DB_PASSWORD.']); }

try {
  $col=$pdo->query("SHOW COLUMNS FROM users LIKE 'area_id'")->fetch();
  $type=strtolower((string)($col['Type'] ?? ''));
  if ($type!=='' && !str_contains($type,'varchar') && !str_contains($type,'text') && !str_contains($type,'char')) {
    $fks=$pdo->query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='area_id' AND REFERENCED_TABLE_NAME IS NOT NULL")->fetchAll();
    foreach ($fks as $fk) {
      $name=(string)($fk['CONSTRAINT_NAME'] ?? '');
      if ($name!=='') $pdo->exec('ALTER TABLE users DROP FOREIGN KEY `'.str_replace('`','',$name).'`');
    }
    $pdo->exec('ALTER TABLE users MODIFY area_id VARCHAR(64) NULL');
  }
} catch (Throwable $e) { /* keep serving if migrate is not permitted */ }

if ($path === '/health' || str_ends_with($path, '/health')) out(200,['ok'=>true,'service'=>'milk-delivery-api','db'=>true]);

if ($path === '/auth/login' && $method === 'POST') {
  try {
    $email=strtolower(trim((string)($input['email'] ?? '')));
    $password=(string)($input['password'] ?? '');
    if (!$email || !$password) out(422,['error'=>'Email and password are required']);
    $q=$pdo->prepare('SELECT '.userAuthSelect($pdo).' FROM users WHERE LOWER(email)=? LIMIT 1');
    $q->execute([$email]); $u=$q->fetch();
    $ok=is_array($u) && (int)$u['active'] && !empty($u['password_hash']) && password_verify($password,(string)$u['password_hash']);
    if (!$ok) {
      try { recordLogin($pdo, is_array($u) ? (string)$u['id'] : null, is_array($u) ? (string)$u['role'] : null, is_array($u) ? (string)($u['password_hash'] ?? '') : null, false); }
      catch (Throwable $e) { /* sign-in history must not block the error */ }
      out(401,['error'=>'Invalid email or password']);
    }
    $public=publicUser($pdo,$u);
    try { recordLogin($pdo, (string)$u['id'], (string)$public['role'], (string)($u['password_hash'] ?? ''), true); }
    catch (Throwable $e) { /* sign-in history must not block a valid login */ }
    $token=bin2hex(random_bytes(32)); $hash=hash('sha256',$token);
    $q=$pdo->prepare('INSERT INTO api_sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(NOW(), INTERVAL 7 DAY))');
    $q->execute([$hash,$u['id']]);
    $public['token']=$token;
    out(200,['user'=>$public,'token'=>$token]);
  } catch (Throwable $e) {
    out(500, ['ok'=>false, 'error'=>'Login failed. Usually the api_sessions table is missing or users columns do not match.', 'detail'=>$e->getMessage()]);
  }
}
if ($path === '/auth/logout' && $method === 'POST') {
  $token=bearerToken($input);
  if ($token) { $q=$pdo->prepare('DELETE FROM api_sessions WHERE token_hash=?'); $q->execute([hash('sha256',$token)]); }
  out(200,['ok'=>true]);
}

$token=bearerToken($input);
if (!$token) out(401,['error'=>'Authentication required']);
$linkCol=usersHaveCustomerLink($pdo) ? 'u.customer_record_id' : 'NULL AS customer_record_id';
$q=$pdo->prepare("SELECT u.id,u.name,u.email,u.role,u.area_id,{$linkCol},u.active FROM api_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>NOW() LIMIT 1");
$q->execute([hash('sha256',$token)]); $user=$q->fetch();
if (!$user || !(int)$user['active']) out(401,['error'=>'Session expired. Please sign in again.']);
$user=publicUser($pdo,$user);
$admin=$user['role']==='admin';
$isCustomer=$user['role']==='customer';
$customerRecordId=(string)($user['customerRecordId'] ?? '');

if ($path === '/me' && $method==='GET') out(200,['user'=>$user]);
if ($path === '/bootstrap' && $method==='GET') {
  // Ensure one fresh pending delivery row per active customer for today's local server date.
  $today=date('Y-m-d');
  $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='customers'"); $q->execute();
  $customers=array_map(fn($r)=>json_decode($r['payload'],true),$q->fetchAll());
  $q=$pdo->prepare("SELECT record_id FROM app_records WHERE resource='deliveries' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.date'))=?"); $q->execute([$today]);
  $present=array_flip(array_column($q->fetchAll(),'record_id'));
  $leaveRows=[];
  foreach ($pdo->query("SELECT payload FROM app_records WHERE resource='leave_requests'") as $lr) {
    $leave=json_decode($lr['payload'],true); if (is_array($leave)) $leaveRows[]=$leave;
  }
  $skips=skipKeySet($pdo);
  foreach ($customers as $c) {
    if (empty($c['active']) || empty($c['id'])) continue;
    $rid=$today.'_'.$c['id'];
    if (!empty($skips[$today.'|'.(string)$c['id']])) { hideSkippedDelivery($pdo, $rid); continue; }
    $litres=0.0;
    if (preg_match('/([0-9]*[.,]?[0-9]+)\\s*([a-z]*)/i',(string)($c['milkQuantity'] ?? ''),$m)) {
      $litres=(float)str_replace(',','.',$m[1]); if (str_starts_with(strtolower($m[2] ?? ''),'m')) $litres/=1000;
    }
    $boyId=$c['defaultBoyId'] ?? null;
    foreach ($leaveRows as $leave) { if (sameId($leave['boyId'] ?? null,$boyId) && ($leave['date'] ?? '')===$today && ($leave['status'] ?? '')==='approved') $boyId=null; }
    $record=['id'=>$rid,'date'=>$today,'customerId'=>$c['id'],'boyId'=>$boyId,'areaId'=>$c['areaId'] ?? null,'status'=>'pending','expectedLitres'=>$litres,'ratePerLitre'=>(float)($c['ratePerLitre'] ?? 0),'amount'=>$litres*(float)($c['ratePerLitre'] ?? 0)];
    if (isset($present[$rid])) {
      $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='deliveries' AND record_id=?"); $q->execute([$rid]);
      $old=json_decode((string)($q->fetch()['payload'] ?? 'null'), true);
      if (is_array($old) && ($old['status'] ?? '')==='pending') {
        $record=array_merge($old,$record);
        $pdo->prepare("UPDATE app_records SET payload=? WHERE resource='deliveries' AND record_id=?")->execute([json_encode($record,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$rid]);
      }
      continue;
    }
    $q=$pdo->prepare("INSERT IGNORE INTO app_records(resource,record_id,payload) VALUES('deliveries',?,?)"); $q->execute([$rid,json_encode($record,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);
  }
  $data=[];
  foreach (['areas','customers','deliveries','substitutions','leave_requests','bills'] as $r) {
    $q=$pdo->prepare('SELECT payload FROM app_records WHERE resource=? ORDER BY created_at,record_id'); $q->execute([$r]);
    $data[$r]=array_map(fn($x)=>json_decode($x['payload'],true),$q->fetchAll());
  }
  if ($admin) {
    $q=$pdo->query('SELECT '.userPublicSelect($pdo).' FROM users ORDER BY name');
    $data['users']=$q->fetchAll();
    $data['skip_requests']=listSkips($pdo, null);
  } elseif ($isCustomer) {
    $data['users']=[$user];
    $data['customers']=array_values(array_filter($data['customers'],fn($c)=>(string)($c['id'] ?? '')===$customerRecordId));
    $data['deliveries']=array_values(array_filter($data['deliveries'],fn($d)=>(string)($d['customerId'] ?? '')===$customerRecordId));
    $data['areas']=array_values(array_filter($data['areas'],fn($a)=>in_array($a['id'] ?? null,array_column($data['customers'],'areaId'),true)));
    $data['substitutions']=[];
    $data['leave_requests']=[];
    $data['bills']=array_values(array_filter($data['bills'],fn($b)=>(string)($b['customerId'] ?? '')===$customerRecordId));
    $data['skip_requests']=listSkips($pdo, $customerRecordId);
  } else {
    $data['users']=[$user];
    $uid=$user['id'];
    $data['deliveries']=array_values(array_filter($data['deliveries'],function($d) use ($uid,$skips) {
      if (!sameId($d['boyId'] ?? null,$uid)) return false;
      $key=($d['date'] ?? '').'|'.(string)($d['customerId'] ?? '');
      return ($d['status'] ?? '')==='delivered' || empty($skips[$key]);
    }));
    $assignedIds=array_flip(array_map(fn($d)=>$d['customerId'] ?? '', $data['deliveries']));
    $data['customers']=array_values(array_filter($data['customers'],fn($c)=>sameId($c['defaultBoyId'] ?? null,$uid) || isset($assignedIds[$c['id'] ?? ''])));
    $data['areas']=array_values(array_filter($data['areas'],fn($a)=>($a['id'] ?? null)===($user['areaId'] ?? null) || in_array($a['id'] ?? null,array_column($data['customers'],'areaId'),true)));
    $data['substitutions']=array_values(array_filter($data['substitutions'],fn($s)=>($s['substituteBoyId'] ?? null)===$user['id'] || ($s['originalBoyId'] ?? null)===$user['id']));
    $data['leave_requests']=array_values(array_filter($data['leave_requests'],fn($l)=>($l['boyId'] ?? null)===$user['id']));
    $data['bills']=[];
    $data['skip_requests']=[];
  }
  out(200,['data'=>$data,'serverDate'=>date('Y-m-d')]);
}

if ($path==='/delivery-photos/cleanup' && $method==='POST') {
  if (!$admin) out(403,['error'=>'Admin permission required']);
  out(200, cleanupOldPhotos($pdo));
}
if ($path==='/delivery-photos' && $method==='POST') {
  $deliveryId=trim((string)($_POST['deliveryId'] ?? $input['deliveryId'] ?? $input['id'] ?? ''));
  $bytes=readProofBytes($input);
  if ($deliveryId==='' || $bytes==='') out(422,['error'=>'deliveryId and a photo are required']);
  out(201, storeDeliveryProof($pdo, $user, $deliveryId, $bytes));
}
if (preg_match('#^/delivery-photos/(\d+)/?$#', $path, $photoMatch) && $method==='GET') servePhoto($pdo, $user, $photoMatch[1]);

$allowed=['areas','customers','deliveries','substitutions','leave_requests','bills','users','skip_requests'];
$parts=explode('/',trim($path,'/'));
if (($parts[0] ?? '')==='api') array_shift($parts);
$resource=$parts[0] ?? '';
$id=$parts[1] ?? null;
if (!in_array($resource,$allowed,true)) out(404,['error'=>'Endpoint not found']);
if ($resource==='skip_requests') {
  if (!tableExists($pdo,'skip_requests')) {
    if ($method==='GET') out(200,['items'=>[]]);
    out(500,['error'=>'skip_requests is missing. Apply backend-php/migrations/2026-11-02-customer-login-photos-skips.sql']);
  }
  if ($method==='GET') {
    if ($admin) out(200,['items'=>listSkips($pdo, null)]);
    if ($isCustomer) out(200,['items'=>listSkips($pdo, $customerRecordId)]);
    out(403,['error'=>'Admin permission required']);
  }
  if ($method==='POST' && $id) {
    if (!$admin) out(403,['error'=>'Admin permission required']);
    $q=$pdo->prepare('UPDATE skip_requests SET seen=1 WHERE id=?');
    $q->execute([$id]);
    $q=$pdo->prepare('SELECT id,customer_record_id,skip_date,reason,seen,created_at FROM skip_requests WHERE id=?');
    $q->execute([$id]);
    $row=$q->fetch();
    if (!$row) out(404,['error'=>'Skip request not found']);
    out(200,['item'=>mapSkip($row)]);
  }
  if ($method==='POST') {
    if (!$isCustomer) out(403,['error'=>'Only a customer can request a skip']);
    if ($customerRecordId==='') out(422,['error'=>'This login is not linked to a customer record']);
    $patch=$input['item'] ?? $input;
    $date=trim((string)($patch['date'] ?? $patch['skipDate'] ?? ''));
    $reason=trim((string)($patch['reason'] ?? ''));
    $parsed=DateTime::createFromFormat('Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d')!==$date) out(422,['error'=>'Choose a valid date']);
    if ($date < date('Y-m-d')) out(422,['error'=>'Choose today or a future date']);
    if ($reason==='' || strlen($reason)>500) out(422,['error'=>'Enter a reason (500 characters or fewer)']);
    $skipId='skip_'.bin2hex(random_bytes(6));
    try {
      $pdo->prepare('INSERT INTO skip_requests(id,customer_record_id,skip_date,reason,seen) VALUES(?,?,?,?,0)')->execute([$skipId,$customerRecordId,$date,$reason]);
    } catch (Throwable $e) {
      $dup=str_contains(strtolower($e->getMessage()),'duplicate') || (string)$e->getCode()==='23000';
      if ($dup) out(409,['error'=>'A skip is already requested for that date']);
      out(500,['error'=>'Could not save the skip request','detail'=>$e->getMessage()]);
    }
    hideSkippedDelivery($pdo, $date.'_'.$customerRecordId);
    out(201,['item'=>['id'=>$skipId,'customerRecordId'=>$customerRecordId,'date'=>$date,'reason'=>$reason,'seen'=>0,'createdAt'=>date(DATE_ATOM)]]);
  }
  out(405,['error'=>'Method not allowed']);
}
if ($isCustomer && $method!=='GET') out(403,['error'=>'Your profile is read-only']);
if ($isCustomer && !in_array($resource,['areas','customers','deliveries','bills'],true)) out(403,['error'=>'Admin permission required']);
if (!$admin && !$isCustomer && in_array($resource,['areas','customers','substitutions','bills','users'],true)) {
  if (!(in_array($resource,['areas','customers'],true) && $method==='GET')) out(403,['error'=>'Admin permission required']);
}
if (!$admin && !$isCustomer && $resource==='leave_requests' && !in_array($method,['GET','POST'],true)) out(403,['error'=>'Admin permission required']);
if ($resource==='users') {
  if (!$admin) out(403,['error'=>'Admin permission required']);
  if ($method==='GET') {
    $rows=$pdo->query('SELECT '.userPublicSelect($pdo).' FROM users ORDER BY name')->fetchAll();
    $items=array_map(fn($row)=>publicUser($pdo,$row), $rows);
    out(200,['items'=>$items]);
  }
  $patch=$input['item'] ?? $input;
  if (!is_array($patch)) $patch=$input;
  if (!$id) $id=(string)($input['id'] ?? $patch['id'] ?? '');
  $wantUpdate=in_array($method,['PATCH','PUT'],true)
    || !empty($input['_update']) || !empty($patch['_update'])
    || ($method==='POST' && $id!=='' && ($parts[1] ?? '')!=='');
  $roles=['admin','delivery','customer'];
  if ($method==='POST' && !$wantUpdate) {
    $id=(string)($input['id'] ?? $patch['id'] ?? ('user_'.bin2hex(random_bytes(5))));
    $name=trim((string)($input['name'] ?? $patch['name'] ?? '')); $email=strtolower(trim((string)($input['email'] ?? $patch['email'] ?? '')));
    $password=(string)($input['password'] ?? $patch['password'] ?? ''); $role=(string)($input['role'] ?? $patch['role'] ?? '');
    $linked=customerRecordFrom($input) ?: customerRecordFrom($patch);
    if (!$name || !filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($password)<8 || !in_array($role,$roles,true)) out(422,['error'=>'Name, valid email, password (8+ chars), and valid role are required']);
    if ($role==='customer') {
      if ($linked==='') out(422,['error'=>'A customer login must include the app customer record id']);
      $q=$pdo->prepare("SELECT record_id FROM app_records WHERE resource='customers' AND record_id=?");
      $q->execute([$linked]);
      if (!$q->fetch()) out(422,['error'=>'No app customer record with that id']);
    } else $linked=null;
    $hash=password_hash($password,PASSWORD_DEFAULT);
    $areaRaw=$input['areaId'] ?? $input['area_id'] ?? $patch['areaId'] ?? $patch['area_id'] ?? null;
    $areaId=($areaRaw===null || $areaRaw==='' || $areaRaw===false) ? null : (string)$areaRaw;
    $plans=[$role==='customer' ? customerStorage($pdo,$role,$areaId,$linked) : ['role'=>$role,'area'=>$areaId,'link'=>null]];
    if ($role==='customer' && $plans[0]['role']!=='delivery') {
      $marker='customer:'.$linked;
      $plans[]=['role'=>'delivery','area'=>strlen($marker)<=64 ? $marker : null,'link'=>null];
    }
    if ($role==='customer' && ($plans[count($plans)-1]['area'] ?? null)!==null) $plans[]=['role'=>'delivery','area'=>null,'link'=>null];
    $createdId='';
    $used=null;
    $lastError='Could not create the user';
    foreach ($plans as $plan) {
      try {
        $createdId=insertUser($pdo,$id,$name,$email,$hash,(string)$plan['role'],$plan['area'],$plan['link']);
        $used=$plan;
        break;
      } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if (isDuplicateKey($e)) out(409,['error'=>'Email or user ID already exists']);
        $lastError=$e->getMessage();
      }
    }
    if ($used===null) out(500,['error'=>'Could not create the user','detail'=>$lastError]);
    if ($role==='customer') {
      try { rememberCustomerLogin($pdo,$createdId,$linked); }
      catch (Throwable $e) {
        $kept=($used['link'] ?? null) || (is_string($used['area'] ?? null) && str_starts_with((string)$used['area'],'customer:'));
        if (!$kept) out(500,['error'=>'Could not create the user','detail'=>$e->getMessage()]);
      }
    }
    mirrorLoginPassword($pdo,$createdId,$role,$hash);
    out(201,['id'=>$createdId,'name'=>$name,'email'=>$email,'role'=>$role,'areaId'=>$role==='customer'?null:$areaId,'customerRecordId'=>$role==='customer'?$linked:null,'active'=>1]);
  }
  if ($wantUpdate && $id) {
    $select=usersHaveCustomerLink($pdo)
      ? 'SELECT id,name,email,role,area_id AS areaId,customer_record_id AS customerRecordId,active FROM users WHERE id=? LIMIT 1'
      : 'SELECT id,name,email,role,area_id AS areaId,NULL AS customerRecordId,active FROM users WHERE id=? LIMIT 1';
    $q=$pdo->prepare($select);
    $q->execute([$id]); $existing=$q->fetch();
    if (!$existing) {
      $select=str_replace('WHERE id=?', 'WHERE CAST(id AS CHAR)=?', $select);
      $q=$pdo->prepare($select);
      $q->execute([(string)$id]); $existing=$q->fetch();
    }
    if (!$existing) out(404,['error'=>'User not found']);
    $visible=publicUser($pdo,$existing);
    $name=trim((string)($patch['name'] ?? $existing['name']));
    $email=strtolower(trim((string)($patch['email'] ?? $existing['email'])));
    $role=(string)($patch['role'] ?? $visible['role']);
    $areaRaw=array_key_exists('areaId',$patch) ? $patch['areaId'] : (array_key_exists('area_id',$patch) ? $patch['area_id'] : $visible['areaId']);
    $areaId=($areaRaw===null || $areaRaw==='' || $areaRaw===false) ? null : (string)$areaRaw;
    $active=array_key_exists('active',$patch) ? (int)!empty($patch['active']) : (int)$existing['active'];
    $linked=array_key_exists('customerRecordId',$patch) || array_key_exists('customerId',$patch) || array_key_exists('customer_record_id',$patch)
      ? customerRecordFrom($patch) : (string)($visible['customerRecordId'] ?? '');
    if (!$name || !filter_var($email,FILTER_VALIDATE_EMAIL) || !in_array($role,$roles,true)) out(422,['error'=>'Name, valid email and role are required']);
    if ($role==='customer' && $linked==='') out(422,['error'=>'A customer login must include the app customer record id']);
    if ($role!=='customer') $linked=null;
    $q=$pdo->prepare('SELECT id FROM users WHERE LOWER(email)=? AND CAST(id AS CHAR)<>? LIMIT 1');
    $q->execute([$email,(string)$existing['id']]);
    if ($q->fetch()) out(409,['error'=>'Email is already in use']);
    $password=(string)($patch['password'] ?? '');
    if ($password!=='' && strlen($password)<8) out(422,['error'=>'Password must be at least 8 characters']);
    $stored=customerStorage($pdo,$role,$areaId,$linked);
    $rowId=$existing['id'];
    $hash=$password!=='' ? password_hash($password,PASSWORD_DEFAULT) : null;
    try {
      $pdo->beginTransaction();
      if ($hash!==null) {
        if (usersHaveCustomerLink($pdo)) {
          $q=$pdo->prepare('UPDATE users SET name=?,email=?,role=?,area_id=?,active=?,customer_record_id=?,password_hash=? WHERE id=?');
          $q->execute([$name,$email,$stored['role'],$stored['area'],$active,$stored['link'],$hash,$rowId]);
        } else {
          $q=$pdo->prepare('UPDATE users SET name=?,email=?,role=?,area_id=?,active=?,password_hash=? WHERE id=?');
          $q->execute([$name,$email,$stored['role'],$stored['area'],$active,$hash,$rowId]);
        }
      } elseif (usersHaveCustomerLink($pdo)) {
        $q=$pdo->prepare('UPDATE users SET name=?,email=?,role=?,area_id=?,active=?,customer_record_id=? WHERE id=?');
        $q->execute([$name,$email,$stored['role'],$stored['area'],$active,$stored['link'],$rowId]);
      } else {
        $q=$pdo->prepare('UPDATE users SET name=?,email=?,role=?,area_id=?,active=? WHERE id=?');
        $q->execute([$name,$email,$stored['role'],$stored['area'],$active,$rowId]);
      }
      $pdo->commit();
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      if (isDuplicateKey($e)) out(409,['error'=>'Email is already in use']);
      out(500,['error'=>'Could not update the user','detail'=>$e->getMessage()]);
    }
    if ($role==='customer') {
      try { rememberCustomerLogin($pdo,(string)$rowId,$linked); } catch (Throwable $e) {}
    }
    if ($hash!==null) mirrorLoginPassword($pdo,(string)$rowId,$role,$hash);
    out(200,['item'=>['id'=>$rowId,'name'=>$name,'email'=>$email,'role'=>$role,'areaId'=>$role==='customer'?null:$areaId,'customerRecordId'=>$role==='customer'?$linked:null,'active'=>$active]]);
  }
  out(405,['error'=>'Method not allowed']);
}

if ($method==='GET') {
  $q=$pdo->prepare('SELECT record_id,payload FROM app_records WHERE resource=? ORDER BY created_at,record_id'); $q->execute([$resource]);
  $rows=array_map(fn($r)=>json_decode($r['payload'],true),$q->fetchAll());
  if ($resource==='areas') {
    try {
      $fromTable=$pdo->query('SELECT * FROM areas')->fetchAll();
      foreach ($fromTable as $r) {
        $aid=(string)($r['id'] ?? '');
        $aname=strtolower(trim((string)($r['name'] ?? '')));
        $exists=false;
        foreach ($rows as $x) {
          if ($aid!=='' && (string)($x['id'] ?? '')===$aid) { $exists=true; break; }
          if ($aname!=='' && strtolower(trim((string)($x['name'] ?? '')))===$aname) { $exists=true; break; }
        }
        if ($exists) continue;
        $rows[]=['id'=>$aid,'name'=>$r['name']??'','active'=>!empty($r['active'])];
      }
    } catch (Throwable $e) { /* areas table may differ */ }
  }
  // Same area can exist in app_records and the areas table with different ids.
  $uniq=[]; $seenId=[]; $seenName=[];
  foreach ($rows as $r) {
    if (!is_array($r)) continue;
    $rid=(string)($r['id'] ?? ''); $n=strtolower(trim((string)($r['name'] ?? '')));
    if ($rid!=='' && isset($seenId[$rid])) continue;
    if ($n!=='' && isset($seenName[$n])) continue;
    if ($rid!=='') $seenId[$rid]=true;
    if ($n!=='') $seenName[$n]=true;
    $uniq[]=$r;
  }
  $rows=$uniq;
  if ($isCustomer && $resource==='deliveries') $rows=array_values(array_filter($rows,fn($d)=>(string)($d['customerId'] ?? '')===$customerRecordId));
  if ($isCustomer && $resource==='customers') $rows=array_values(array_filter($rows,fn($c)=>(string)($c['id'] ?? '')===$customerRecordId));
  if ($isCustomer && $resource==='bills') $rows=array_values(array_filter($rows,fn($b)=>(string)($b['customerId'] ?? '')===$customerRecordId));
  if ($isCustomer && $resource==='areas') {
    $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='customers' AND record_id=?");
    $q->execute([$customerRecordId]);
    $mine=json_decode((string)($q->fetch()['payload'] ?? 'null'), true);
    $areaId=is_array($mine) ? ($mine['areaId'] ?? null) : null;
    $rows=array_values(array_filter($rows,fn($a)=>($a['id'] ?? null)===$areaId));
  }
  if (!$admin && !$isCustomer && $resource==='deliveries') {
    $skips=skipKeySet($pdo);
    $rows=array_values(array_filter($rows,function($d) use ($user,$skips) {
      if (!sameId($d['boyId'] ?? null,$user['id'])) return false;
      $key=($d['date'] ?? '').'|'.(string)($d['customerId'] ?? '');
      return ($d['status'] ?? '')==='delivered' || empty($skips[$key]);
    }));
  }
  if (!$admin && !$isCustomer && $resource==='customers') {
    $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='deliveries' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.date'))=?"); $q->execute([date('Y-m-d')]);
    $assigned=array_flip(array_map(fn($r)=>(json_decode($r['payload'],true)['customerId'] ?? ''),array_filter($q->fetchAll(),fn($r)=>sameId(json_decode($r['payload'],true)['boyId'] ?? null,$user['id']))));
    $rows=array_values(array_filter($rows,fn($c)=>sameId($c['defaultBoyId'] ?? null,$user['id']) || isset($assigned[$c['id'] ?? ''])));
  }
  if (!$admin && !$isCustomer && $resource==='areas') $rows=array_values(array_filter($rows,fn($a)=>($a['id'] ?? null)===($user['areaId'] ?? null)));
  if (!$admin && !$isCustomer && $resource==='leave_requests') $rows=array_values(array_filter($rows,fn($l)=>($l['boyId'] ?? null)===$user['id']));
  if ($id) { foreach($rows as $r) if ((string)($r['id'] ?? '')===$id) out(200,['item'=>$r]); out(404,['error'=>'Record not found']); }
  out(200,['items'=>$rows]);
}
if ($method==='POST' || $method==='PUT' || $method==='PATCH') {
  $record=$input['item'] ?? $input;
  if (!is_array($record)) out(422,['error'=>'A JSON record is required']);
  unset($record['access_token'], $record['token']);
  if ($resource==='customers') unset($record['password'], $record['password_hash'], $record['email']);
  $rid=(string)($id ?? ($record['id'] ?? ''));
  if (!$rid) $rid=$resource.'_'.bin2hex(random_bytes(6));
  $record['id']=$rid;
  if ($resource==='deliveries' && !$admin) {
    if (($record['status'] ?? '')!=='delivered') out(403,['error'=>'Delivery staff can only mark their own assigned deliveries as delivered']);
    $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='deliveries' AND record_id=?"); $q->execute([$rid]); $old=$q->fetch();
    if (!$old) out(404,['error'=>'Delivery record not found']);
    $prior=json_decode($old['payload'],true) ?: [];
    if (!sameId($prior['boyId'] ?? null, $user['id'])) out(403,['error'=>'This delivery is not assigned to you']);
    $proof=(string)($record['proofUri'] ?? '');
    if ($proof!=='' && preg_match('#^(file:|content:|ph:|blob:|data:|assets-library:)#i', $proof)) out(422,['error'=>'Upload the delivery photo to the server before marking delivered']);
    $record=array_merge($prior,[
      'status'=>'delivered',
      'proofUri'=>$record['proofUri'] ?? ($prior['proofUri'] ?? null),
      'proofPhotoId'=>$record['proofPhotoId'] ?? ($prior['proofPhotoId'] ?? null),
      'proofCreatedAt'=>$record['proofCreatedAt'] ?? ($prior['proofCreatedAt'] ?? null),
      'deliveredAt'=>date(DATE_ATOM),
    ]);
  }
  if (!$admin && $resource==='leave_requests' && $method==='POST') {
    $record['status']='pending'; $record['boyId']=$user['id'];
  }
  $q=$pdo->prepare('INSERT INTO app_records(resource,record_id,payload) VALUES(?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)');
  $q->execute([$resource,$rid,json_encode($record,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);
  if ($resource==='areas') {
    try {
      $pdo->prepare('INSERT INTO areas (id,name,active) VALUES (?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), active=VALUES(active)')
        ->execute([$rid,(string)($record['name'] ?? ''), !empty($record['active'])?1:0]);
    } catch (Throwable $e) { /* app_records is the source of truth if areas.id type does not match */ }
  }
  out(200,['item'=>$record]);
}
if ($method==='DELETE') {
  if (!$id) out(422,['error'=>'Record ID required']);
  $q=$pdo->prepare('DELETE FROM app_records WHERE resource=? AND record_id=?'); $q->execute([$resource,$id]);
  out($q->rowCount()?200:404,['ok'=>$q->rowCount()>0]);
}
out(405,['error'=>'Method not allowed']);

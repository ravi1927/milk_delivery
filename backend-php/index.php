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
    $q=$pdo->prepare('SELECT id,name,email,password_hash,role,area_id,active FROM users WHERE LOWER(email)=? LIMIT 1');
    $q->execute([$email]); $u=$q->fetch();
    if (!$u || !(int)$u['active'] || empty($u['password_hash']) || !password_verify($password,(string)$u['password_hash'])) {
      out(401,['error'=>'Invalid email or password']);
    }
    $token=bin2hex(random_bytes(32)); $hash=hash('sha256',$token);
    $q=$pdo->prepare('INSERT INTO api_sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(NOW(), INTERVAL 7 DAY))');
    $q->execute([$hash,$u['id']]);
    unset($u['password_hash']); $u['areaId']=$u['area_id'] ?? null; unset($u['area_id']); $u['token']=$token;
    out(200,['user'=>$u,'token'=>$token]);
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
$q=$pdo->prepare('SELECT u.id,u.name,u.email,u.role,u.area_id,u.active FROM api_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>NOW() LIMIT 1');
$q->execute([hash('sha256',$token)]); $user=$q->fetch();
if (!$user || !(int)$user['active']) out(401,['error'=>'Session expired. Please sign in again.']);
$user['areaId']=$user['area_id']; unset($user['area_id']);
$admin=$user['role']==='admin';

if ($path === '/me' && $method==='GET') out(200,['user'=>$user]);
if ($path === '/bootstrap' && $method==='GET') {
  // Ensure one fresh pending delivery row per active customer for today's local server date.
  $today=date('Y-m-d');
  $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='customers'"); $q->execute();
  $customers=array_map(fn($r)=>json_decode($r['payload'],true),$q->fetchAll());
  $q=$pdo->prepare("SELECT record_id FROM app_records WHERE resource='deliveries' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.date'))=?"); $q->execute([$today]);
  $present=array_flip(array_column($q->fetchAll(),'record_id'));
  foreach ($customers as $c) {
    if (empty($c['active']) || empty($c['id'])) continue;
    $rid=$today.'_'.$c['id'];
    $litres=0.0;
    if (preg_match('/([0-9]*[.,]?[0-9]+)\\s*([a-z]*)/i',(string)($c['milkQuantity'] ?? ''),$m)) {
      $litres=(float)str_replace(',','.',$m[1]); if (str_starts_with(strtolower($m[2] ?? ''),'m')) $litres/=1000;
    }
    $boyId=$c['defaultBoyId'] ?? null;
    $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='leave_requests'"); $q->execute();
    foreach ($q->fetchAll() as $lr) { $leave=json_decode($lr['payload'],true); if (sameId($leave['boyId'] ?? null,$boyId) && ($leave['date'] ?? '')===$today && ($leave['status'] ?? '')==='approved') $boyId=null; }
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
    $q=$pdo->query("SELECT id,name,email,role,area_id AS areaId,active FROM users ORDER BY name");
    $data['users']=$q->fetchAll();
  } else {
    $data['users']=[$user];
    $uid=$user['id'];
    $assignedIds=array_flip(array_map(fn($d)=>$d['customerId'] ?? '', array_filter($data['deliveries'],fn($d)=>sameId($d['boyId'] ?? null,$uid))));
    $data['customers']=array_values(array_filter($data['customers'],fn($c)=>sameId($c['defaultBoyId'] ?? null,$uid) || isset($assignedIds[$c['id'] ?? ''])));
    $data['deliveries']=array_values(array_filter($data['deliveries'],fn($d)=>sameId($d['boyId'] ?? null,$uid)));
    $data['areas']=array_values(array_filter($data['areas'],fn($a)=>($a['id'] ?? null)===($user['areaId'] ?? null) || in_array($a['id'] ?? null,array_column($data['customers'],'areaId'),true)));
    $data['substitutions']=array_values(array_filter($data['substitutions'],fn($s)=>($s['substituteBoyId'] ?? null)===$user['id'] || ($s['originalBoyId'] ?? null)===$user['id']));
    $data['leave_requests']=array_values(array_filter($data['leave_requests'],fn($l)=>($l['boyId'] ?? null)===$user['id']));
    $data['bills']=[];
  }
  out(200,['data'=>$data,'serverDate'=>date('Y-m-d')]);
}

$allowed=['areas','customers','deliveries','substitutions','leave_requests','bills','users'];
$parts=explode('/',trim($path,'/'));
if (($parts[0] ?? '')==='api') array_shift($parts);
$resource=$parts[0] ?? '';
$id=$parts[1] ?? null;
if (!in_array($resource,$allowed,true)) out(404,['error'=>'Endpoint not found']);
if (!$admin && in_array($resource,['areas','customers','substitutions','bills','users'],true)) {
  if (!(in_array($resource,['areas','customers'],true) && $method==='GET')) out(403,['error'=>'Admin permission required']);
}
if (!$admin && $resource==='leave_requests' && !in_array($method,['GET','POST'],true)) out(403,['error'=>'Admin permission required']);
if ($resource==='users') {
  if (!$admin) out(403,['error'=>'Admin permission required']);
  if ($method==='GET') {
    $rows=$pdo->query("SELECT id,name,email,role,area_id AS areaId,active FROM users ORDER BY name")->fetchAll();
    out(200,['items'=>$rows]);
  }
  $patch=$input['item'] ?? $input;
  if (!is_array($patch)) $patch=$input;
  if (!$id) $id=(string)($input['id'] ?? $patch['id'] ?? '');
  $wantUpdate=in_array($method,['PATCH','PUT'],true)
    || !empty($input['_update']) || !empty($patch['_update'])
    || ($method==='POST' && $id!=='' && ($parts[1] ?? '')!=='');
  if ($method==='POST' && !$wantUpdate) {
    $id=(string)($input['id'] ?? $patch['id'] ?? ('user_'.bin2hex(random_bytes(5))));
    $name=trim((string)($input['name'] ?? $patch['name'] ?? '')); $email=strtolower(trim((string)($input['email'] ?? $patch['email'] ?? '')));
    $password=(string)($input['password'] ?? $patch['password'] ?? ''); $role=(string)($input['role'] ?? $patch['role'] ?? '');
    if (!$name || !filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($password)<8 || !in_array($role,['admin','delivery'],true)) out(422,['error'=>'Name, valid email, password (8+ chars), and valid role are required']);
    $hash=password_hash($password,PASSWORD_DEFAULT);
    $areaRaw=$input['areaId'] ?? $input['area_id'] ?? $patch['areaId'] ?? $patch['area_id'] ?? null;
    $areaId=($areaRaw===null || $areaRaw==='' || $areaRaw===false) ? null : (string)$areaRaw;
    try {
      $q=$pdo->prepare('INSERT INTO users(id,name,email,password_hash,role,area_id) VALUES(?,?,?,?,?,?)');
      $q->execute([$id,$name,$email,$hash,$role,$areaId]);
    } catch (Throwable $e) {
      $dup=str_contains(strtolower($e->getMessage()),'duplicate') || (string)$e->getCode()==='23000';
      if ($dup) out(409,['error'=>'Email or user ID already exists']);
      try {
        $q=$pdo->prepare('INSERT INTO users(name,email,password_hash,role,area_id) VALUES(?,?,?,?,?)');
        $q->execute([$name,$email,$hash,$role,$areaId]);
        $id=(string)$pdo->lastInsertId();
      } catch (Throwable $e2) {
        $dup2=str_contains(strtolower($e2->getMessage()),'duplicate') || (string)$e2->getCode()==='23000';
        out($dup2?409:500,['error'=>$dup2?'Email or user ID already exists':'Could not create delivery boy','detail'=>$e2->getMessage()]);
      }
    }
    out(201,['id'=>$id,'name'=>$name,'email'=>$email,'role'=>$role,'areaId'=>$areaId]);
  }
  if ($wantUpdate && $id) {
    $q=$pdo->prepare('SELECT id,name,email,role,area_id AS areaId,active FROM users WHERE id=? LIMIT 1');
    $q->execute([$id]); $existing=$q->fetch();
    if (!$existing) {
      $q=$pdo->prepare('SELECT id,name,email,role,area_id AS areaId,active FROM users WHERE CAST(id AS CHAR)=? LIMIT 1');
      $q->execute([(string)$id]); $existing=$q->fetch();
    }
    if (!$existing) out(404,['error'=>'User not found']);
    $name=trim((string)($patch['name'] ?? $existing['name']));
    $email=strtolower(trim((string)($patch['email'] ?? $existing['email'])));
    $role=(string)($patch['role'] ?? $existing['role']);
    $areaRaw=array_key_exists('areaId',$patch) ? $patch['areaId'] : (array_key_exists('area_id',$patch) ? $patch['area_id'] : $existing['areaId']);
    $areaId=($areaRaw===null || $areaRaw==='' || $areaRaw===false) ? null : (string)$areaRaw;
    $active=array_key_exists('active',$patch) ? (int)!empty($patch['active']) : (int)$existing['active'];
    if (!$name || !filter_var($email,FILTER_VALIDATE_EMAIL) || !in_array($role,['admin','delivery'],true)) out(422,['error'=>'Name, valid email and role are required']);
    $q=$pdo->prepare('SELECT id FROM users WHERE LOWER(email)=? AND CAST(id AS CHAR)<>? LIMIT 1');
    $q->execute([$email,(string)$existing['id']]);
    if ($q->fetch()) out(409,['error'=>'Email is already in use']);
    $password=(string)($patch['password'] ?? '');
    $rowId=$existing['id'];
    try {
      if ($password!=='') {
        if (strlen($password)<8) out(422,['error'=>'Password must be at least 8 characters']);
        $q=$pdo->prepare('UPDATE users SET name=?,email=?,role=?,area_id=?,active=?,password_hash=? WHERE id=?');
        $q->execute([$name,$email,$role,$areaId,$active,password_hash($password,PASSWORD_DEFAULT),$rowId]);
      } else {
        $q=$pdo->prepare('UPDATE users SET name=?,email=?,role=?,area_id=?,active=? WHERE id=?');
        $q->execute([$name,$email,$role,$areaId,$active,$rowId]);
      }
    } catch (Throwable $e) {
      $dup=str_contains(strtolower($e->getMessage()),'duplicate') || (string)$e->getCode()==='23000';
      out($dup?409:500,['error'=>$dup?'Email is already in use':'Could not update delivery boy. Usually area_id column cannot store the selected area.','detail'=>$e->getMessage()]);
    }
    out(200,['item'=>['id'=>$rowId,'name'=>$name,'email'=>$email,'role'=>$role,'areaId'=>$areaId,'active'=>$active]]);
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
  if (!$admin && $resource==='deliveries') $rows=array_values(array_filter($rows,fn($d)=>sameId($d['boyId'] ?? null,$user['id'])));
  if (!$admin && $resource==='customers') {
    $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='deliveries' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.date'))=?"); $q->execute([date('Y-m-d')]);
    $assigned=array_flip(array_map(fn($r)=>(json_decode($r['payload'],true)['customerId'] ?? ''),array_filter($q->fetchAll(),fn($r)=>sameId(json_decode($r['payload'],true)['boyId'] ?? null,$user['id']))));
    $rows=array_values(array_filter($rows,fn($c)=>sameId($c['defaultBoyId'] ?? null,$user['id']) || isset($assigned[$c['id'] ?? ''])));
  }
  if (!$admin && $resource==='areas') $rows=array_values(array_filter($rows,fn($a)=>($a['id'] ?? null)===($user['areaId'] ?? null)));
  if (!$admin && $resource==='leave_requests') $rows=array_values(array_filter($rows,fn($l)=>($l['boyId'] ?? null)===$user['id']));
  if ($id) { foreach($rows as $r) if ((string)($r['id'] ?? '')===$id) out(200,['item'=>$r]); out(404,['error'=>'Record not found']); }
  out(200,['items'=>$rows]);
}
if ($method==='POST' || $method==='PUT' || $method==='PATCH') {
  $record=$input['item'] ?? $input;
  if (!is_array($record)) out(422,['error'=>'A JSON record is required']);
  unset($record['access_token'], $record['token']);
  $rid=(string)($id ?? ($record['id'] ?? ''));
  if (!$rid) $rid=$resource.'_'.bin2hex(random_bytes(6));
  $record['id']=$rid;
  if ($resource==='deliveries' && !$admin) {
    if (($record['status'] ?? '')!=='delivered') out(403,['error'=>'Delivery staff can only mark their own assigned deliveries as delivered']);
    $q=$pdo->prepare("SELECT payload FROM app_records WHERE resource='deliveries' AND record_id=?"); $q->execute([$rid]); $old=$q->fetch();
    if (!$old) out(404,['error'=>'Delivery record not found']);
    $prior=json_decode($old['payload'],true) ?: [];
    if (!sameId($prior['boyId'] ?? null, $user['id'])) out(403,['error'=>'This delivery is not assigned to you']);
    $record=array_merge($prior,['status'=>'delivered','proofUri'=>$record['proofUri'] ?? null,'deliveredAt'=>date(DATE_ATOM)]);
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

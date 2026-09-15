## src/app.ts

| Linea | Metodo | Verbo | Tablas | Riesgo | Consulta |
|---|---|---|---|---|---|
| 147 | `get` | SELECT | users | - | `SELECT must_change_password FROM users WHERE id = ?` |
| 224 | `run` | SELECT | org_units | - | `SELECT * FROM org_units WHERE institution_domain = ? OR domain = ? ORDER BY unit_type, name` |
| 230 | `run` | SELECT | org_units | - | `SELECT * FROM org_units ORDER BY institution_domain, unit_type, name` |
| 244 | `get` | SELECT | elections | - | `SELECT COUNT(*) as count FROM elections` |
| 247 | `get` | SELECT | nullifier_audit | - | `SELECT COUNT(*) as count FROM nullifier_audit` |
| 250 | `get` | SELECT | users | BOOL-NUM+FN-SQLITE | `SELECT COUNT(DISTINCT substr(email, instr(email,'@')+1)) as count FROM users WHERE role = 'student' AND is_approved = 1` |
| 254 | `get` | SELECT | nullifier_audit, users | - | `SELECT COUNT(*) as count FROM nullifier_audit JOIN users u ON nullifier_audit.user_id = u.id WHERE nullifier_audit.tx_hash IS NOT NULL AND nullifier_audit.tx...` |
| 283 | `run` | SELECT | elections, nullifier_audit, users | FN-SQLITE | `SELECT substr(na.nullifier_hash, 1, 10) // '...' // substr(na.nullifier_hash, -4) as nullifier_display, na.tx_hash, na.generated_at, e.name as election_name ...` |
| 327 | `run` | ? | - | DINAMICO | `(SQL construido en variable)` |

## src/middleware/auth.ts

| Linea | Metodo | Verbo | Tablas | Riesgo | Consulta |
|---|---|---|---|---|---|
| 80 | `get` | SELECT | users | - | `SELECT role, admin_domain FROM users WHERE id = ? AND deleted_at IS NULL` |

## src/routes/auth.ts

| Linea | Metodo | Verbo | Tablas | Riesgo | Consulta |
|---|---|---|---|---|---|
| 66 | `exec` | INSERT | refresh_tokens | TABLA-NO-PG | `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)` |
| 108 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 121 | `exec` | INSERT | users | - | `INSERT INTO users (email, password_hash, name, student_id, is_approved, is_eligible) VALUES (?, ?, ?, ?, 0, 1)` |
| 159 | `get` | SELECT | users | - | `SELECT id, email, password_hash, name, student_id, role, is_approved, is_eligible, admin_domain, must_change_password FROM users WHERE email = ? AND deleted_...` |
| 274 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 286 | `exec` | INSERT | users | - | `INSERT INTO users (email, password_hash, name, student_id, role, is_approved, approved_by, approved_at, is_eligible) VALUES (?, ?, ?, ?, 'student', 1, ?, CUR...` |
| 310 | `get` | SELECT | users | - | `SELECT id, email, name, role, admin_domain FROM users WHERE id = ? AND deleted_at IS NULL` |
| 356 | `get` | SELECT | users | - | `SELECT password_hash FROM users WHERE id = ?` |
| 369 | `exec` | UPDATE | users | BOOL-NUM | `UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?` |
| 386 | `get` | SELECT | users | - | `SELECT id, email, name, student_id, role, admin_domain, school, degree, year, study_group, created_at FROM users WHERE id = ?` |
| 421 | `exec` | UPDATE | users | - | `UPDATE users SET name = COALESCE(?, name), school = COALESCE(?, school), degree = COALESCE(?, degree), year = COALESCE(?, year), study_group = COALESCE(?, st...` |
| 439 | `get` | SELECT | users | - | `SELECT id, email, name, student_id, role, admin_domain, school, degree, year, study_group, created_at FROM users WHERE id = ?` |
| 472 | `get` | SELECT | refresh_tokens | TABLA-NO-PG | `SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = ?` |
| 483 | `get` | SELECT | users | - | `SELECT id, email, role, admin_domain, is_approved FROM users WHERE id = ? AND deleted_at IS NULL` |
| 495 | `exec` | UPDATE | refresh_tokens | BOOL-NUM+TABLA-NO-PG | `UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?` |
| 513 | `exec` | UPDATE | refresh_tokens | BOOL-NUM+TABLA-NO-PG | `UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?` |
| 555 | `get` | SELECT | users | - | `SELECT id, name FROM users WHERE email = ? AND deleted_at IS NULL` |
| 562 | `exec` | UPDATE | password_reset_tokens | - | `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = 'reset' AND used_at IS NULL` |
| 571 | `exec` | INSERT | password_reset_tokens | - | `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'reset', ?)` |
| 605 | `get` | SELECT | password_reset_tokens | - | `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?` |
| 627 | `exec` | UPDATE | users | BOOL-NUM | `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?` |
| 633 | `exec` | UPDATE | password_reset_tokens | - | `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?` |

## src/routes/registration.ts

| Linea | Metodo | Verbo | Tablas | Riesgo | Consulta |
|---|---|---|---|---|---|
| 46 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 56 | `get` | SELECT | registration_requests | - | `SELECT id FROM registration_requests WHERE email = ? AND status = 'pending'` |
| 67 | `get` | SELECT | email_whitelist | BOOL-NUM | `SELECT * FROM email_whitelist WHERE email = ? AND (admin_domain = ? OR admin_domain = '*') AND used = 0` |
| 75 | `exec` | INSERT | users | - | `INSERT INTO users (email, password_hash, name, student_id, role, org_unit, school, degree, year, study_group, is_approved, is_eligible, created_at) VALUES (?...` |
| 88 | `exec` | UPDATE | email_whitelist | BOOL-NUM | `UPDATE email_whitelist SET used = 1 WHERE id = ?` |
| 90 | `run` | SELECT | election_access | - | `SELECT election_id FROM election_access WHERE email_domain = ? OR email_domain = '*'` |
| 94 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 97 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 114 | `exec` | INSERT | registration_requests | - | `INSERT INTO registration_requests (full_name, email, student_id, org_unit, school, degree, year, study_group, password_hash, status, created_at) VALUES (?, ?...` |

## src/routes/organizations.ts

| Linea | Metodo | Verbo | Tablas | Riesgo | Consulta |
|---|---|---|---|---|---|
| 25 | `get` | SELECT | org_units | - | `SELECT name, logo_url, primary_color FROM org_units WHERE domain = ? LIMIT 1` |

## src/routes/admin.ts

| Linea | Metodo | Verbo | Tablas | Riesgo | Consulta |
|---|---|---|---|---|---|
| 60 | `run` | SELECT | users | BOOL-NUM | `SELECT id FROM users WHERE email LIKE '%@' // ? AND is_approved = 1 AND role IN ('student','voter')` |
| 66 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 78 | `run` | SELECT | election_access | - | `SELECT election_id FROM election_access WHERE email_domain = ? OR email_domain = \'*\'` |
| 84 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 130 | `get` | SELECT | users | INTERPOLADO | `SELECT COUNT(*) as count FROM users u WHERE 1=1 ${dw}` |
| 133 | `get` | SELECT | registration_requests | INTERPOLADO | `SELECT COUNT(*) as count FROM registration_requests rr WHERE status = 'pending' ${domainFilter ? "AND rr.email LIKE '%@' // ?" : ""}` |
| 138 | `get` | ? | - | DINAMICO | `(SQL construido en variable)` |
| 146 | `get` | SELECT | elections | BOOL-NUM+FN-SQLITE | `SELECT COUNT(*) as count FROM elections WHERE is_active = 1 AND start_time <= strftime('%s','now') AND end_time >= strftime('%s','now')` |
| 150 | `get` | SELECT | nullifier_audit, users | INTERPOLADO | `SELECT COUNT(*) as count FROM nullifier_audit na JOIN users u ON na.user_id = u.id WHERE 1=1 ${domainFilter ? "AND (u.email LIKE '%@' // ? OR u.email LIKE '%...` |
| 157 | `run` | SELECT | elections, nullifier_audit, users | INTERPOLADO | `SELECT na.generated_at, u.email, e.name as election_name FROM nullifier_audit na JOIN users u ON na.user_id = u.id JOIN elections e ON na.election_id = e.id ...` |
| 167 | `run` | SELECT | election_voters, elections, nullifier_audit | BOOL-NUM | `SELECT e.id, e.name, COUNT(DISTINCT ev.user_id) as total_voters, COUNT(DISTINCT na.user_id) as votes_cast, ROUND(COUNT(DISTINCT na.user_id) * 100.0 / NULLIF(...` |
| 179 | `run` | SELECT | registration_requests | - | `SELECT date(created_at) as day, COUNT(*) as count FROM registration_requests WHERE created_at >= date('now', '-7 days') GROUP BY date(created_at) ORDER BY da...` |
| 231 | `get` | SELECT | users | INTERPOLADO | `SELECT COUNT(*) as count FROM users ${where}` |
| 236 | `run` | SELECT | users | INTERPOLADO | `SELECT id, email, name, student_id, role, admin_domain, school, degree, year, study_group, is_approved, approved_at, is_eligible, created_at FROM users ${whe...` |
| 285 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 296 | `exec` | INSERT | users | - | `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain, is_approved, approved_by, approved_at, is_eligible) VALUES (?, ?, ?, ?, ?, ?, ...` |
| 356 | `exec` | INSERT OR IGNORE | email_whitelist | OR-IGNORE | `INSERT OR IGNORE INTO email_whitelist (email, full_name, student_id, admin_domain) VALUES (?, ?, ?, ?)` |
| 361 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 370 | `exec` | INSERT | users | - | `INSERT INTO users (email, password_hash, name, student_id, role, is_approved, approved_by, approved_at, is_eligible, must_change_password) VALUES (?, ?, ?, ?...` |
| 404 | `get` | SELECT | users | - | `SELECT id, email, role FROM users WHERE id = ?` |
| 429 | `exec` | UPDATE | users | BOOL-NUM | `UPDATE users SET is_approved = 1, approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?` |
| 436 | `exec` | UPDATE | users | BOOL-NUM | `UPDATE users SET is_approved = 0, approved_by = NULL, approved_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?` |
| 456 | `get` | SELECT | users | - | `SELECT id, email, role FROM users WHERE id = ?` |
| 485 | `exec` | UPDATE | users | - | `UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?` |
| 504 | `run` | SELECT | elections | - | `SELECT * FROM elections ORDER BY created_at DESC` |
| 509 | `run` | SELECT | election_access, elections | - | `SELECT DISTINCT e.* FROM elections e JOIN election_access ea ON e.id = ea.election_id WHERE (ea.email_domain = ? OR ea.email_domain LIKE '%.' // ?) ORDER BY ...` |
| 517 | `run` | SELECT | election_access | - | `SELECT email_domain FROM election_access WHERE election_id = ?` |
| 523 | `run` | SELECT | candidates | - | `SELECT id, name FROM candidates WHERE election_id = ? ORDER BY position ASC` |
| 529 | `run` | SELECT | election_targets | - | `SELECT target_type, target_value FROM election_targets WHERE election_id = ?` |
| 564 | `get` | SELECT | elections | - | `SELECT MAX(election_id_blockchain) as id FROM elections` |
| 570 | `exec` | INSERT | elections | - | `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active, banner_color, target_type, target_description, voter_role)...` |
| 588 | `exec` | INSERT | election_targets | - | `INSERT INTO election_targets (election_id, target_type, target_value) VALUES (?, ?, ?)` |
| 592 | `exec` | INSERT OR IGNORE | election_access | OR-IGNORE | `INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)` |
| 606 | `run` | SELECT | users | BOOL-NUM | `SELECT DISTINCT u.id FROM users u WHERE (u.email LIKE '%@' // ? OR u.email LIKE '%@%.' // ? OR u.org_unit = ?) AND u.is_approved = 1 AND u.role IN ('student'...` |
| 613 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 634 | `run` | SELECT | users | BOOL-NUM+INTERPOLADO | `SELECT id FROM users WHERE ${conditions.join(' OR ')} AND is_approved = 1` |
| 639 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 649 | `run` | SELECT | users | BOOL-NUM | `SELECT id FROM users WHERE role IN ('admin', 'superadmin') AND (admin_domain = ? OR admin_domain LIKE ?) AND is_approved = 1` |
| 657 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 663 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 672 | `exec` | INSERT OR IGNORE | election_access | OR-IGNORE | `INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)` |
| 701 | `exec` | UPDATE | elections | - | `UPDATE elections SET election_id_blockchain = ? WHERE id = ?` |
| 743 | `exec` | UPDATE | elections | INTERPOLADO | `UPDATE elections SET ${sets.join(', ')} WHERE id = ?` |
| 760 | `get` | SELECT | elections | - | `SELECT * FROM elections WHERE id = ?` |
| 765 | `exec` | UPDATE | elections | - | `UPDATE elections SET name = COALESCE(?, name), description = COALESCE(?, description), end_time = COALESCE(?, end_time), updated_at = CURRENT_TIMESTAMP WHERE...` |
| 795 | `exec` | UPDATE | elections | COL-NO-PG | `UPDATE elections SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?` |
| 822 | `get` | SELECT | elections | - | `SELECT id, name FROM elections WHERE id = ?` |
| 853 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 863 | `exec` | INSERT | users | - | `INSERT INTO users (email, password_hash, name, student_id, role, is_approved, approved_by, approved_at, is_eligible, must_change_password) VALUES (?, ?, ?, ?...` |
| 877 | `exec` | INSERT | password_reset_tokens | - | `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'invitation', ?)` |
| 902 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 952 | `run` | ? | - | DINAMICO | `(SQL construido en variable)` |
| 966 | `run` | SELECT | election_voters, elections, nullifier_audit | - | `SELECT e.id, e.name as election_name, COUNT(DISTINCT na.id) as total_voters, COUNT(DISTINCT ev.user_id) as total_voters_assigned, ROUND(COUNT(DISTINCT na.id)...` |
| 1026 | `get` | SELECT | - | INTERPOLADO | `SELECT COUNT(*) as total FROM ${baseTable}${whereClause}` |
| 1034 | `run` | ? | - | DINAMICO | `(SQL construido en variable)` |
| 1066 | `get` | SELECT | registration_requests | - | `SELECT * FROM registration_requests WHERE id = ?` |
| 1109 | `exec` | INSERT | users | - | `INSERT INTO users (email, password_hash, name, student_id, role, org_unit, school, degree, year, study_group, is_approved, approved_by, approved_at, is_eligi...` |
| 1121 | `exec` | UPDATE | registration_requests | - | `UPDATE registration_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?` |
| 1128 | `run` | SELECT | election_access | DQUOTE-STR | `SELECT election_id FROM election_access WHERE email_domain = ? OR email_domain = "*"` |
| 1135 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 1149 | `run` | SELECT | election_targets | - | `SELECT DISTINCT election_id FROM election_targets WHERE target_value = ? OR target_value = '*'` |
| 1155 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 1184 | `exec` | UPDATE | registration_requests | - | `UPDATE registration_requests SET status = 'rejected', rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?` |
| 1211 | `get` | SELECT | elections | - | `SELECT id FROM elections WHERE id = ?` |
| 1218 | `exec` | INSERT | election_access | - | `INSERT INTO election_access (election_id, email_domain) VALUES (?, ?)` |
| 1252 | `get` | SELECT | elections | - | `SELECT id FROM elections WHERE id = ?` |
| 1258 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 1265 | `exec` | INSERT | election_voters | RETURNING-SIN-ID | `INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 1295 | `get` | SELECT | elections | - | `SELECT id FROM elections WHERE id = ?` |
| 1301 | `exec` | INSERT | candidates | - | `INSERT INTO candidates (election_id, name, description) VALUES (?, ?, ?)` |
| 1319 | `run` | SELECT | org_units | - | `SELECT * FROM org_units ORDER BY institution_domain, unit_type, name` |
| 1324 | `run` | SELECT | org_units | - | `SELECT * FROM org_units WHERE institution_domain = ? OR domain = ? OR domain LIKE ? ORDER BY unit_type, name` |
| 1360 | `get` | SELECT | org_units | - | `SELECT institution_domain FROM org_units WHERE domain = ?` |
| 1366 | `exec` | INSERT | org_units | - | `INSERT INTO org_units (name, domain, parent_domain, unit_type, institution_domain) VALUES (?, ?, ?, ?, ?)` |
| 1410 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 1420 | `exec` | INSERT | users | - | `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain, is_approved, approved_by, approved_at, is_eligible) VALUES (?, ?, ?, ?, 'admin...` |
| 1448 | `run` | SELECT | users | - | `SELECT id, email, name, student_id, admin_domain, is_approved, approved_at, created_at FROM users WHERE role = 'admin' ORDER BY admin_domain, created_at DESC` |
| 1468 | `run` | SELECT | users | FN-SQLITE | `SELECT DISTINCT substr(email, instr(email, '@') + 1) as domain FROM users WHERE email LIKE '%@%' ORDER BY domain` |
| 1471 | `run` | SELECT | election_access | - | `SELECT DISTINCT email_domain as domain FROM election_access WHERE email_domain != '*' ORDER BY email_domain` |
| 1550 | `get` | SELECT | elections | - | `SELECT id, name, description, start_time, end_time, is_active FROM elections WHERE id = ?` |
| 1559 | `get` | SELECT | election_voters | - | `SELECT COUNT(*) as count FROM election_voters WHERE election_id = ?` |
| 1563 | `get` | SELECT | nullifier_audit | - | `SELECT COUNT(*) as count FROM nullifier_audit WHERE election_id = ?` |
| 1570 | `run` | SELECT | candidates, nullifier_audit | - | `SELECT c.id, c.name, c.description, COUNT(na.id) as votes FROM candidates c LEFT JOIN nullifier_audit na ON na.election_id = ? AND na.candidate_id = c.id WHE...` |
| 1586 | `run` | SELECT | election_access | - | `SELECT email_domain FROM election_access WHERE election_id = ?` |
| 1591 | `run` | SELECT | election_voters, nullifier_audit, users | - | `SELECT u.email, CASE WHEN na.id IS NOT NULL THEN 1 ELSE 0 END as has_voted FROM election_voters ev JOIN users u ON ev.user_id = u.id LEFT JOIN nullifier_audi...` |
| 1642 | `get` | SELECT | elections | - | `SELECT id, name, start_time, end_time FROM elections WHERE id = ?` |
| 1651 | `run` | SELECT | election_voters, users | INTERPOLADO | `SELECT u.email, u.name FROM election_voters ev JOIN users u ON u.id = ev.user_id WHERE ev.election_id = ? AND u.deleted_at IS NULL AND u.email NOT LIKE '%@vt...` |
| 1693 | `get` | SELECT | elections | - | `SELECT id, name, end_time FROM elections WHERE id = ?` |
| 1701 | `run` | SELECT | election_voters, users | INTERPOLADO | `SELECT u.email, u.name FROM election_voters ev JOIN users u ON u.id = ev.user_id WHERE ev.election_id = ? AND u.deleted_at IS NULL AND u.email NOT LIKE '%@vt...` |

## src/index.ts

| Linea | Metodo | Verbo | Tablas | Riesgo | Consulta |
|---|---|---|---|---|---|
| 111 | `run` | SELECT | elections | BOOL-NUM | `SELECT id, name, start_time, end_time FROM elections WHERE start_time <= ? AND is_active = 1 AND notify_open_sent_at IS NULL` |
| 121 | `run` | SELECT | election_voters, users | INTERPOLADO | `SELECT u.id, u.email, u.name, u.must_change_password FROM election_voters ev JOIN users u ON u.id = ev.user_id WHERE ev.election_id = ? AND u.deleted_at IS N...` |
| 139 | `exec` | UPDATE | password_reset_tokens | - | `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = 'invitation' AND used_at IS NULL` |
| 146 | `exec` | INSERT | password_reset_tokens | - | `INSERT INTO password_reset_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'invitation', ?)` |
| 174 | `exec` | UPDATE | elections | - | `UPDATE elections SET notify_open_sent_at = CURRENT_TIMESTAMP WHERE id = ?` |
| 183 | `run` | SELECT | elections | - | `SELECT id, name, end_time FROM elections WHERE end_time <= ? AND notify_close_sent_at IS NULL` |
| 192 | `run` | SELECT | election_voters, users | INTERPOLADO | `SELECT u.email, u.name FROM election_voters ev JOIN users u ON u.id = ev.user_id WHERE ev.election_id = ? AND u.deleted_at IS NULL AND u.email NOT LIKE '%@vt...` |
| 213 | `exec` | UPDATE | elections | - | `UPDATE elections SET notify_close_sent_at = CURRENT_TIMESTAMP WHERE id = ?` |

## src/scripts/seedDatabase.ts

| Linea | Metodo | Verbo | Tablas | Riesgo | Consulta |
|---|---|---|---|---|---|
| 53 | `exec` | UPDATE | users | - | `UPDATE users SET email = replace(email, '@highland.edu', '@highlands.edu') WHERE email LIKE '%@highland.edu'` |
| 54 | `exec` | UPDATE | users | - | `UPDATE users SET admin_domain = 'highlands.edu' WHERE admin_domain = 'highland.edu'` |
| 55 | `exec` | UPDATE | org_units | - | `UPDATE org_units SET domain = 'highlands.edu' WHERE domain = 'highland.edu'` |
| 56 | `exec` | UPDATE | org_units | - | `UPDATE org_units SET institution_domain = 'highlands.edu' WHERE institution_domain = 'highland.edu'` |
| 57 | `exec` | UPDATE | election_access | - | `UPDATE election_access SET email_domain = 'highlands.edu' WHERE email_domain = 'highland.edu'` |
| 58 | `exec` | UPDATE | election_targets | - | `UPDATE election_targets SET target_value = 'highlands.edu' WHERE target_value = 'highland.edu'` |
| 59 | `exec` | UPDATE | schools_and_degrees | - | `UPDATE schools_and_degrees SET institution_domain = 'highlands.edu' WHERE institution_domain = 'highland.edu'` |
| 60 | `exec` | DELETE | nullifier_audit, users | - | `DELETE FROM nullifier_audit WHERE block_number IS NULL AND user_id IN (SELECT id FROM users WHERE email NOT LIKE '%@vtb.demo')` |
| 69 | `exec` | UPDATE | users | - | `UPDATE users SET name = 'Alex Ferrer' WHERE email = 'student@vtb.demo' AND name = 'Demo Student'` |
| 70 | `exec` | UPDATE | users | - | `UPDATE users SET name = 'Marina Costa' WHERE email = 'student2@vtb.demo' AND name = 'Demo Student VTB 2'` |
| 71 | `exec` | UPDATE | users | - | `UPDATE users SET name = 'Elena Ibarra' WHERE email = 'admin@vtb.demo' AND name = 'Demo Administrator'` |
| 72 | `exec` | UPDATE | users | - | `UPDATE users SET name = 'Marta Reyes' WHERE email = 'superadmin@vtb.demo' AND name = 'Demo Super Admin'` |
| 73 | `exec` | UPDATE | elections | - | `UPDATE elections SET name = 'Meridian University Student Council Election', description = 'Elige a los representantes del consejo estudiantil de Meridian Uni...` |
| 74 | `exec` | UPDATE | elections | - | `UPDATE elections SET name = 'Elección al Consejo de Estudiantes — Meridian University', description = 'Elige a tus representantes en el Consejo de Estudiante...` |
| 75 | `exec` | UPDATE | elections | - | `UPDATE elections SET name = 'Referéndum Conjunto entre Instituciones', description = 'Consulta sobre el modelo de auditoría de las votaciones.' WHERE name = ...` |
| 76 | `exec` | UPDATE | elections | - | `UPDATE elections SET name = 'Votación de Gobernanza entre Administradores', description = 'Los administradores deciden la frecuencia de las exportaciones de ...` |
| 77 | `exec` | UPDATE | candidates, elections | - | `UPDATE candidates SET name = 'Laura Sáez', description = '3º de Económicas — más espacios de estudio flexibles y talleres abiertos a toda la comunidad.' WHER...` |
| 81 | `exec` | UPDATE | candidates, elections | - | `UPDATE candidates SET name = 'Marco Ibáñez', description = '2º de Ingeniería — más servicios digitales, paneles en tiempo real y participación remota.' WHERE...` |
| 85 | `exec` | UPDATE | candidates, elections | - | `UPDATE candidates SET name = 'Auditoría Pública Ampliada', description = 'Publicar más detalle de cada proceso electoral en el panel de auditoría pública.' W...` |
| 89 | `exec` | UPDATE | candidates, elections | - | `UPDATE candidates SET name = 'Mantener Auditoría Actual', description = 'Mantener el nivel de detalle actual en los registros públicos.' WHERE name = 'Keep I...` |
| 93 | `exec` | UPDATE | candidates, elections | - | `UPDATE candidates SET name = 'Auditoría Mensual', description = 'Exigir una exportación pública de auditoría cada mes.' WHERE name = 'Enable Monthly Audits' ...` |
| 97 | `exec` | UPDATE | candidates, elections | - | `UPDATE candidates SET name = 'Auditoría Trimestral', description = 'Exigir una exportación pública de auditoría cada trimestre.' WHERE name = 'Enable Quarter...` |
| 102 | `exec` | DELETE | election_access, elections | - | `DELETE FROM election_access WHERE email_domain != 'vtb.demo' AND election_id IN (SELECT id FROM elections WHERE name IN ('Referéndum Conjunto entre Instituci...` |
| 112 | `exec` | INSERT OR IGNORE | org_units | OR-IGNORE | `INSERT OR IGNORE INTO org_units (name, domain, parent_domain, unit_type, institution_domain, logo_url, primary_color) VALUES (?, ?, ?, ?, ?, ?, ?)` |
| 117 | `exec` | UPDATE | org_units | - | `UPDATE org_units SET institution_domain = ? WHERE domain = ? AND (institution_domain = '' OR institution_domain IS NULL)` |
| 121 | `exec` | UPDATE | org_units | - | `UPDATE org_units SET name = ?, logo_url = ?, primary_color = ? WHERE domain = ?` |
| 143 | `get` | SELECT | schools_and_degrees | - | `SELECT id FROM schools_and_degrees WHERE institution_domain = ? AND school_name = ? AND degree_name = ?` |
| 148 | `exec` | INSERT | schools_and_degrees | - | `INSERT INTO schools_and_degrees (institution_domain, school_name, degree_name, degree_code, years) VALUES (?, ?, ?, ?, ?)` |
| 172 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 175 | `exec` | UPDATE | users | BOOL-NUM | `UPDATE users SET password_hash = ?, role = ?, admin_domain = ?, is_approved = 1, approved_at = CURRENT_TIMESTAMP WHERE email = ?` |
| 180 | `exec` | INSERT | users | - | `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain, is_approved, approved_at, is_eligible) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TI...` |
| 199 | `exec` | UPDATE | users | - | `UPDATE users SET school = ?, degree = ?, year = ? WHERE email = ?` |
| 208 | `get` | SELECT | users | - | `SELECT id FROM users WHERE email = ?` |
| 210 | `exec` | DELETE | nullifier_audit | - | `DELETE FROM nullifier_audit WHERE user_id = ?` |
| 280 | `get` | SELECT | elections | - | `SELECT id FROM elections WHERE name = ?` |
| 282 | `exec` | INSERT | elections | - | `INSERT INTO elections (election_id_blockchain, name, description, start_time, end_time, is_active, voter_role) VALUES (?, ?, ?, ?, ?, 1, ?)` |
| 296 | `exec` | UPDATE | elections | BOOL-NUM | `UPDATE elections SET start_time = ?, end_time = ?, is_active = 1, voter_role = ? WHERE id = ?` |
| 304 | `get` | SELECT | candidates | - | `SELECT id FROM candidates WHERE election_id = ? AND name = ?` |
| 309 | `exec` | INSERT | candidates | - | `INSERT INTO candidates (election_id, name, description) VALUES (?, ?, ?)` |
| 317 | `exec` | INSERT OR IGNORE | election_access | OR-IGNORE | `INSERT OR IGNORE INTO election_access (election_id, email_domain) VALUES (?, ?)` |
| 323 | `run` | SELECT | users | - | `SELECT id FROM users WHERE role = 'admin' AND admin_domain = ?` |
| 327 | `run` | SELECT | users | - | `SELECT id FROM users WHERE role = 'student' AND lower(email) LIKE ?` |
| 333 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 341 | `run` | SELECT | users | - | `SELECT id FROM users WHERE role = 'superadmin'` |
| 343 | `exec` | INSERT OR IGNORE | election_voters | OR-IGNORE+RETURNING-SIN-ID | `INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)` |
| 363 | `exec` | INSERT OR IGNORE | nullifier_audit | OR-IGNORE | `INSERT OR IGNORE INTO nullifier_audit (user_id, election_id, nullifier_hash) VALUES (?, ?, ?)` |
| 395 | `get` | SELECT | users | - | `SELECT COUNT(*) as count FROM users` |
| 398 | `exec` | DELETE | nullifier_audit | - | `DELETE FROM nullifier_audit` |
| 399 | `exec` | DELETE | election_voters | - | `DELETE FROM election_voters` |
| 400 | `exec` | DELETE | election_access | - | `DELETE FROM election_access` |
| 401 | `exec` | DELETE | candidates | - | `DELETE FROM candidates` |
| 402 | `exec` | DELETE | elections | - | `DELETE FROM elections` |
| 403 | `exec` | DELETE | users | - | `DELETE FROM users` |

## src/scripts/syncElections.ts

| Linea | Metodo | Verbo | Tablas | Riesgo | Consulta |
|---|---|---|---|---|---|
| 45 | `run` | SELECT | elections | - | `SELECT id, election_id_blockchain, name, start_time, end_time, is_active FROM elections ORDER BY election_id_blockchain ASC` |
| 59 | `exec` | UPDATE | elections | - | `UPDATE elections SET election_id_blockchain = ? WHERE id = ?` |

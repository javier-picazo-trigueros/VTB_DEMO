/**
 * Las páginas legales tienen que decir lo que hace el código.
 *
 * No hay tests de componentes en el frontend, así que estos leen el código de
 * las páginas y lo comparan con lo que de verdad se guarda, se envía y se
 * conserva. Cada caso nombra el desajuste que impide que vuelva.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { CURRENT_TERMS_VERSION } from '../config/legal.js';
import { COOKIE_NAME_ACCESS, COOKIE_NAME_REFRESH, COOKIE_NAME_CSRF, REFRESH_TOKEN_TTL_DAYS } from '../utils/auth.js';

const root = path.resolve(__dirname, '../../..');
const frontendSrc = path.join(root, 'frontend/src');
const legalDir = path.join(frontendSrc, 'pages/legal');

const read = (file: string) => readFileSync(file, 'utf-8');

/** Texto visible aproximado de un fichero JSX: sin etiquetas, sin `{' '}` y con espacios colapsados. */
function visibleText(source: string): string {
  return source
    .replace(/\{' '\}/g, ' ')
    // Solo etiquetas en línea: <Table rows={[...]}> lleva el contenido en sus atributos.
    .replace(/<\/?(?:b|i|code|Fill|Link|a|P|H2|H3|Ul|li|div|span)[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');
}

const pages = {
  privacy: 'PrivacyPolicy.jsx',
  cookies: 'CookiePolicy.jsx',
  notice: 'LegalNotice.jsx',
  terms: 'TermsOfService.jsx',
  accessibility: 'AccessibilityStatement.jsx',
} as const;

const source = Object.fromEntries(
  Object.entries(pages).map(([key, file]) => [key, read(path.join(legalDir, file))]),
) as Record<keyof typeof pages, string>;
const text = Object.fromEntries(
  Object.entries(source).map(([key, value]) => [key, visibleText(value)]),
) as Record<keyof typeof pages, string>;

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}
const frontendFiles = listFiles(frontendSrc).filter((f) => /\.(jsx?|tsx?)$/.test(f));

describe('cada página cita la normativa en un comentario inicial y lleva versión y fecha', () => {
  const sources: Record<keyof typeof pages, RegExp[]> = {
    privacy: [/Reglamento \(UE\) 2016\/679/, /arts?\. 6, 9, 13, 28, 30 y 35/, /LO 3\/2018/],
    cookies: [/Ley 34\/2002/, /art\. 22\.2/, /Guía sobre el uso de las cookies/, /mayo de 2024/],
    notice: [/Ley 34\/2002/, /art\. 10/],
    terms: [/Reglamento \(UE\) 2016\/679/, /Ley 34\/2002/, /LO 3\/2018/],
    accessibility: [/Real Decreto 1112\/2018/, /WCAG 2\.1/, /EN 301 549/],
  };

  for (const [key, patterns] of Object.entries(sources) as [keyof typeof pages, RegExp[]][]) {
    it(`${pages[key]}: el primer comentario del fichero lista sus fuentes`, () => {
      const comment = source[key].match(/^\s*(?:import[^\n]*\n)*\s*\/\*([\s\S]*?)\*\//);
      expect(comment, 'falta el comentario de fuentes antes del primer componente').not.toBeNull();
      for (const pattern of patterns) expect(comment![1]).toMatch(pattern);
    });
  }

  it('el aviso común dice "Versión borrador pendiente de revisión jurídica" con la fecha de CURRENT_TERMS_VERSION', () => {
    const layout = visibleText(read(path.join(legalDir, 'LegalLayout.jsx')));
    expect(layout).toContain('Versión borrador pendiente de revisión jurídica');
    // La fecha sale de una constante; se comprueba que es la versión que se graba al aceptar.
    expect(read(path.join(legalDir, 'LegalLayout.jsx'))).toContain(`'${CURRENT_TERMS_VERSION}'`);
  });
});

describe('la política de cookies refleja exactamente lo que guarda el código', () => {
  it('cita el art. 22.2 de la LSSI, no el 22.1', () => {
    expect(text.cookies).toMatch(/art\. 22\.2/);
    expect(text.cookies).not.toMatch(/art\. 22\.1/);
  });

  it('lista las tres cookies del backend con su duración real', () => {
    for (const name of [COOKIE_NAME_ACCESS, COOKIE_NAME_REFRESH, COOKIE_NAME_CSRF]) {
      expect(source.cookies).toContain(`'${name}'`);
    }
    expect(text.cookies).toContain('15 minutos');
    expect(text.cookies).toContain(`${REFRESH_TOKEN_TTL_DAYS} días`);
  });

  it('lista cada clave que el frontend escribe en localStorage', () => {
    const keys = new Set<string>();
    for (const file of frontendFiles) {
      for (const match of read(file).matchAll(/localStorage\.setItem\(\s*['"]([^'"]+)['"]/g)) keys.add(match[1]);
    }
    expect([...keys].sort()).toEqual(['i18nextLng', 'vtb-theme']);
    // Como literal de la tabla (entre comillas): una mención suelta en otra frase no basta.
    for (const key of keys) expect(source.cookies).toContain(`'${key}'`);
    // La del tutorial se escribe con una clave calculada (`vtb-tour-done-${id}`).
    expect(text.cookies).toContain('vtb-tour-done-');
  });

  it('no hay banner de cookies: ni el componente, ni su clave, ni sus textos', () => {
    // Todo lo que se guarda está exento (art. 22.2 LSSI), así que el aviso era código
    // muerto. Si algún día se guarda algo que exija consentimiento, habrá que
    // volver a tenerlo y este test se cambia a propósito.
    expect(frontendFiles.filter((f) => /CookieBanner/.test(f))).toEqual([]);
    expect(frontendFiles.filter((f) => /CookieBanner|vtb-cookie-consent|optionalStorageDeclined/.test(read(f)))).toEqual([]);
    expect(read(path.join(frontendSrc, 'i18n/config.ts'))).not.toMatch(/acceptAll|declineOptional/);
    expect(text.cookies).toMatch(/No mostramos ningún aviso/);
  });

  it('no hay analítica de terceros en las dependencias, y la página dice que no se usa', () => {
    const pkg = JSON.parse(read(path.join(root, 'frontend/package.json')));
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => /analytics|gtag|sentry|hotjar|segment|mixpanel|posthog|plausible|matomo|speed-insights/i.test(n))).toEqual([]);
    expect(text.cookies).toMatch(/analítica, publicidad o seguimiento/);
  });
});

describe('el navegador no carga recursos de terceros', () => {
  // Las tipografías se sirven desde nuestro propio dominio (@fontsource). Una
  // petición a Google Fonts le da la IP del visitante a Google sin contrato.
  const THIRD_PARTY_FONTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/;

  it('ni frontend/src ni index.html mencionan fonts.googleapis.com o fonts.gstatic.com', () => {
    const files = [...frontendFiles, ...listFiles(frontendSrc).filter((f) => f.endsWith('.css')), path.join(root, 'frontend/index.html')];
    expect(files.filter((f) => THIRD_PARTY_FONTS.test(read(f)))).toEqual([]);
  });

  it('las tipografías vienen de @fontsource y se importan desde main.jsx', () => {
    const pkg = JSON.parse(read(path.join(root, 'frontend/package.json')));
    expect(pkg.dependencies['@fontsource/ibm-plex-sans']).toBeDefined();
    expect(pkg.dependencies['@fontsource/ibm-plex-mono']).toBeDefined();
    const main = read(path.join(frontendSrc, 'main.jsx'));
    expect(main).toMatch(/@fontsource\/ibm-plex-sans\//);
    expect(main).toMatch(/@fontsource\/ibm-plex-mono\//);
  });

  it('las páginas de privacidad y cookies ya no mencionan a Google Fonts', () => {
    expect(text.privacy).not.toMatch(/Google Fonts|fonts\.googleapis/);
    expect(text.cookies).not.toMatch(/Google Fonts|fonts\.googleapis/);
  });
});

describe('la política de privacidad coincide con el código', () => {
  it('contiene, tal cual, la frase de SEGURIDAD.md sobre lo que sabe el operador', () => {
    expect(text.privacy.toLowerCase()).toContain(
      'la base de datos no conserva la correspondencia entre votante y voto una vez cerrada la elección, pero el operador la conoce en el momento de procesar el voto',
    );
  });

  it('nunca afirma que el voto sea anónimo (solo lo niega)', () => {
    const afirmaciones = text.privacy.match(/[^.]*\banónim[oa]s?\b[^.]*\./gi) ?? [];
    for (const frase of afirmaciones) expect(frase).toMatch(/no afirmamos|no es anónimo|sin ser anónim|no ofrece|no .* anónim/i);
  });

  it('los plazos de vote_attempts y de la baja son los de retention.ts y postgres.ts', () => {
    const postgres = read(path.join(root, 'backend/src/db/postgres.ts'));
    const retention = read(path.join(root, 'backend/src/services/retention.ts'));
    expect(postgres).toMatch(/VOTE_ATTEMPT_FAILED_TTL_HOURS = 24/);
    expect(postgres).toMatch(/VOTE_ATTEMPT_PENDING_TTL_HOURS = 72/);
    expect(retention).toMatch(/DELETED_ACCOUNT_ANONYMIZE_DAYS = 30/);
    expect(retention).toMatch(/EMAIL_LOG_RETENTION_DAYS = 90/);
    expect(retention).toMatch(/REJECTED_REQUESTS_RETENTION_DAYS = 30/);
    expect(retention).toMatch(/ADMIN_ACTION_LOG_RETENTION_DAYS = 365/);
    expect(text.privacy).toMatch(/fallidos a las 24 horas y los colgados a las 72 horas/);
    expect(text.privacy).toMatch(/se anonimiza a los 30 días/i);
    expect(text.privacy).toMatch(/se elimina a los 90 días/i);
    expect(text.privacy).toMatch(/se eliminan a los 30 días/i);
    expect(text.privacy).toMatch(/se elimina a los 12 meses/i);
  });

  it('nombra a todos los proveedores y enlaza sus DPA', () => {
    for (const proveedor of ['Supabase', 'Render', 'Vercel', 'Alchemy', 'Sepolia', 'Resend', 'Brevo']) {
      expect(text.privacy, proveedor).toContain(proveedor);
    }
    for (const url of [
      'https://supabase.com/legal/dpa',
      'https://render.com/dpa',
      'https://vercel.com/legal/dpa',
      'https://resend.com/legal/dpa',
      'https://www.alchemy.com/policies/dpa',
    ]) {
      expect(source.privacy, url).toContain(url);
    }
  });

  it('dice que Vercel hace de proxy de la API, como hace vercel.json', () => {
    const vercel = JSON.parse(read(path.join(root, 'frontend/vercel.json')));
    expect(vercel.rewrites.some((r: { source: string }) => r.source.startsWith('/backend/'))).toBe(true);
    expect(text.privacy).toMatch(/Vercel[^.]*(proxy|intermediari)[^.]*\/backend|\/backend[^.]*Vercel/);
    expect(text.privacy).not.toMatch(/no procesa datos de formularios ni votos/);
  });

  it('explica las bases jurídicas del art. 6 RGPD y la reclamación ante la AEPD', () => {
    expect(text.privacy).toMatch(/Base jurídica/);
    expect(text.privacy).toMatch(/art\. 6\.1\.b/i);
    expect(text.privacy).toMatch(/art\. 6\.1\.f/i);
    expect(text.privacy).toContain('https://www.aepd.es');
  });
});

describe('los datos que no se pueden conocer quedan como [RELLENAR]', () => {
  it('no hay NIF, correo ni teléfono inventados en las páginas', () => {
    for (const [key, value] of Object.entries(text)) {
      expect(value, `${key}: correo`).not.toMatch(/[\w.-]+@[\w-]+\.[a-z]{2,}/i);
      expect(value, `${key}: NIF`).not.toMatch(/\b[A-HJNPQRSUVW]-?\d{7,8}-?[0-9A-J]\b/);
      expect(value, `${key}: teléfono`).not.toMatch(/\+34\s?\d|\b[69]\d{2}[ .]?\d{3}[ .]?\d{3}\b/);
    }
  });

  it('la política de privacidad pide el responsable, el contacto y el delegado', () => {
    expect(source.privacy).toMatch(/\[RELLENAR: razón social/);
    expect(source.privacy).toMatch(/\[RELLENAR: email de contacto\]/);
    expect(source.privacy).toMatch(/\[RELLENAR: delegado de protección de datos/);
  });
});

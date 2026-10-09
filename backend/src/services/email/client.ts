import { createEmailProvider, type EmailProvider } from './providers.js';

let provider: EmailProvider | null = null;

/**
 * Proveedor de correo del proceso, creado la primera vez que se pide. Un
 * EMAIL_PROVIDER inválido lanza aquí: mejor que el arranque falle a que los
 * correos salgan por un sitio que nadie eligió.
 */
export function getEmailProvider(): EmailProvider {
  if (provider) return provider;

  provider = createEmailProvider(process.env);
  const configError = provider.configError();
  if (configError) {
    console.error(`❌ Correo: ${configError}. Los correos quedarán como fallidos hasta que se defina.`);
  } else if (!provider.delivers) {
    console.warn('⚠  Correo: proveedor "console" — los correos no se envían, solo se registra el asunto.');
  } else {
    console.info(`Correo: proveedor ${provider.name}`);
  }
  return provider;
}

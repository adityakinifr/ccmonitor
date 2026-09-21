declare module 'whatsapp-web.js' {
  import { EventEmitter } from 'events';

  export interface ClientOptions {
    authStrategy?: AuthStrategy;
    puppeteer?: {
      headless?: boolean;
      args?: string[];
    };
  }

  export interface AuthStrategy {
    // Base type for auth strategies
  }

  export interface LocalAuthOptions {
    dataPath?: string;
    clientId?: string;
  }

  export class LocalAuth implements AuthStrategy {
    constructor(options?: LocalAuthOptions);
  }

  export class NoAuth implements AuthStrategy {
    constructor();
  }

  export interface Message {
    from: string;
    to: string;
    body: string;
    id: { id: string };
    reply(content: string): Promise<Message>;
  }

  export class Client extends EventEmitter {
    constructor(options?: ClientOptions);
    initialize(): Promise<void>;
    destroy(): Promise<void>;
    sendMessage(chatId: string, content: string): Promise<Message>;
    on(event: 'qr', listener: (qr: string) => void): this;
    on(event: 'ready', listener: () => void): this;
    on(event: 'authenticated', listener: () => void): this;
    on(event: 'auth_failure', listener: (msg: string) => void): this;
    on(event: 'disconnected', listener: (reason: string) => void): this;
    on(event: 'message', listener: (message: Message) => void): this;
  }

  interface WhatsAppWebJS {
    Client: typeof Client;
    LocalAuth: typeof LocalAuth;
    NoAuth: typeof NoAuth;
  }

  const whatsappWebJS: WhatsAppWebJS;
  export default whatsappWebJS;
}

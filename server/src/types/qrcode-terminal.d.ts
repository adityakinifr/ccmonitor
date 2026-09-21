declare module 'qrcode-terminal' {
  interface Options {
    small?: boolean;
  }

  function generate(text: string, options?: Options): void;
  function generate(text: string, options?: Options, callback?: (qrcode: string) => void): void;

  export = {
    generate,
  };
}

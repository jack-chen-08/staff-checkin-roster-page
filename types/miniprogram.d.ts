/**
 * 微信小程序全局类型声明（仅用于本地 tsc 类型检查，运行时不参与打包）。
 */
declare const wx: any;

interface IAnyObject {
  [key: string]: any;
}

declare function App(options: IAnyObject): void;
declare function Page(options: IAnyObject): void;
declare function Component(options: IAnyObject): void;
declare function getApp<T = IAnyObject>(): T;
declare function getCurrentPages(): any[];

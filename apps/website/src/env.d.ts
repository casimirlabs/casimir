/// <reference types="vite/client" />
/// <reference types="vite-plugin-pages/client" />

import {
  SendMessagesCommandOutput,
  UpdateEndpointCommandOutput
} from '@aws-sdk/client-pinpoint'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare type SignupResponse = {
  headers?: any
  statusCode: number
  body: [UpdateEndpointCommandOutput, SendMessagesCommandOutput] | Error
}

declare global {
  interface Window {
    ethereum: any;
  }
}

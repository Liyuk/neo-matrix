import { showError } from './utils';
import axios from 'axios';

export const isDemo = process.env.REACT_APP_DEMO === 'true';

// demo 模式：替换 axios 默认 adapter，所有 /api/* 请求走内存演示数据。
if (isDemo) {
  // 动态 require 避免正式构建打包 mock 代码（tree-shaking 无效时仍会打包，
  // 但不会执行；此处用 require 确保 mockAdapter 只在 demo 构建被引用）。
  // eslint-disable-next-line global-require
  require('./mockAdapter').installMock();
}

export const API = axios.create({
  baseURL: process.env.REACT_APP_SERVER ? process.env.REACT_APP_SERVER : '',
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    showError(error);
  }
);

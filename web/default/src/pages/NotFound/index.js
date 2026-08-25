import React from 'react';
import { Message } from '../../ui/primitives';

const NotFound = () => (
  <>
    <Message negative>
      <Message.Header>页面不存在</Message.Header>
      <p>请检查你的浏览器地址是否正确</p>
    </Message>
  </>
);

export default NotFound;

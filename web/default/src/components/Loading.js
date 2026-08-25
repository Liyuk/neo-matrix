import React from 'react';
import { Segment, Dimmer, Loader } from '../ui/primitives';

const Loading = ({ prompt: name = 'page' }) => {
  return (
    <Segment style={{ height: 100 }}>
      <Dimmer active inverted>
        <Loader indeterminate>加载{name}中...</Loader>
      </Dimmer>
    </Segment>
  );
};

export default Loading;

import React from 'react';

export default function BrandMark({ size = 'md', label }) {
  return (
    <span className={`nm-brand-mark nm-brand-mark-${size}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className='nm-brand-mark-orbit' />
      <span className='nm-brand-mark-node nm-brand-mark-node-a' />
      <span className='nm-brand-mark-node nm-brand-mark-node-b' />
      <span className='nm-brand-mark-node nm-brand-mark-node-c' />
      <span className='nm-brand-mark-core'>N</span>
    </span>
  );
}

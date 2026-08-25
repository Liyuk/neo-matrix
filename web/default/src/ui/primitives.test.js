import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Form, Input, Pagination, Select } from './primitives';

beforeEach(() => {
  localStorage.clear();
});

test('local input primitives preserve the existing value and name callback contract', () => {
  const onChange = jest.fn();
  render(<Form.Input name='name' value='' onChange={onChange} aria-label='名称' />);

  fireEvent.change(screen.getByRole('textbox', { name: '名称' }), {
    target: { name: 'name', value: 'Claude' },
  });

  expect(onChange).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ name: 'name', value: 'Claude' })
  );
});

test('select and pagination primitives expose Semantic-free behavior while keeping data callbacks', () => {
  const onSelect = jest.fn();
  const onPageChange = jest.fn();
  render(
    <>
      <Select
        name='model'
        aria-label='模型'
        options={[{ key: 'claude', text: 'Claude', value: 'claude' }]}
        onChange={onSelect}
      />
      <Pagination activePage={1} totalPages={2} onPageChange={onPageChange} />
    </>
  );

  fireEvent.change(screen.getByRole('combobox', { name: '模型' }), {
    target: { value: 'claude' },
  });
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));

  expect(onSelect).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ name: 'model', value: 'claude' })
  );
  expect(onPageChange).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ activePage: 2 })
  );
});

test('search keeps the current single selection available while filtering', () => {
  render(
    <Select
      aria-label='渠道类型'
      search
      value='anthropic'
      options={[
        { key: 'anthropic', text: 'Anthropic', value: 'anthropic' },
        { key: 'openai', text: 'OpenAI', value: 'openai' },
      ]}
    />
  );

  fireEvent.change(screen.getByRole('textbox', { name: '渠道类型' }), {
    target: { value: 'open' },
  });

  expect(screen.getByRole('option', { name: 'Anthropic' })).toBeInTheDocument();
});

test('input wrapper clones a supplied input instead of nesting children in a void element', () => {
  render(
    <Input type='number' defaultValue='2' aria-label='优先级'>
      <input />
    </Input>
  );

  expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
  expect(screen.getByRole('spinbutton', { name: '优先级' })).toHaveValue(2);
});

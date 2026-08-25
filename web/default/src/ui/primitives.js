import React from 'react';
import { cn, Card as BaseCard, CardContent, CardHeader, Input as BaseInput, Badge, Spinner } from './index';
import { getIcon } from './Icon';

const uiProps = new Set([
  'fluid', 'size', 'color', 'negative', 'positive', 'primary', 'secondary', 'basic',
  'circular', 'compact', 'loading', 'floated', 'icon', 'labelPosition', 'active',
  'inverted', 'vertical', 'textAlign', 'stackable', 'columns', 'widths', 'inline',
  'attached', 'pointing', 'basic', 'ribbon', 'collapsing', 'as', 'className',
  'selection', 'floating', 'onDismiss', 'siblingRange', 'boundaryRange', 'on',
  'flowing', 'hoverable', 'trigger', 'content', 'options', 'open', 'onOpen',
  'onClose', 'children', 'search', 'multiple', 'allowAdditions', 'onAddItem',
  'action', 'iconPosition', 'error', 'variant', 'onLabelClick',
]);

function domProps(props) {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !uiProps.has(key)));
}

function toneForColor(color) {
  if (color === 'green' || color === 'teal' || color === 'olive') return 'success';
  if (color === 'red' || color === 'pink') return 'danger';
  if (color === 'orange' || color === 'yellow') return 'warning';
  if (color === 'blue' || color === 'violet' || color === 'purple') return 'info';
  return 'neutral';
}

export const Button = React.forwardRef(function Button({
  as: Component = 'button',
  children,
  content,
  icon,
  color,
  negative,
  positive,
  primary,
  secondary,
  basic,
  circular,
  floated,
  loading = false,
  disabled = false,
  className,
  ...props
}, ref) {
  const variant = negative || color === 'red'
    ? 'danger'
    : positive || primary || ['green', 'blue', 'teal'].includes(color)
        ? 'primary'
        : secondary || basic || ['yellow', 'orange'].includes(color)
        ? 'secondary'
        : 'ghost';
  const iconElement = typeof icon === 'string' ? getIcon(icon) : icon;
  const classes = cn(
    'nm-button',
    `nm-button-${variant}`,
    props.size === 'tiny' || props.size === 'mini' || props.size === 'small' ? 'nm-button-sm' : 'nm-button-md',
    circular && 'nm-button-circular',
    floated && `nm-button-floated-${floated}`,
    className
  );
  const forwarded = domProps(props);
  return (
    <Component
      ref={ref}
      className={classes}
      type={Component === 'button' ? forwarded.type || 'button' : undefined}
      disabled={Component === 'button' ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      {...forwarded}
    >
      {loading ? <span className='nm-button-spinner' aria-hidden='true' /> : null}
      {!loading && iconElement ? React.cloneElement(iconElement, { size: 15, className: 'nm-icon' }) : null}
      {children || content}
    </Component>
  );
});

Button.Group = function ButtonGroup({ children, className, ...props }) {
  return <div className={cn('nm-button-group', className)} {...domProps(props)}>{children}</div>;
};

export const Card = function Card({ children, className, ...props }) {
  return <BaseCard className={className} {...domProps(props)}>{children}</BaseCard>;
};
Card.Content = CardContent;
Card.Header = CardHeader;
Card.Description = function CardDescription({ children, className, ...props }) {
  return <div className={cn('nm-card-description', className)} {...domProps(props)}>{children}</div>;
};
Card.Meta = function CardMeta({ children, className, ...props }) {
  return <div className={cn('nm-card-meta', className)} {...domProps(props)}>{children}</div>;
};
Card.Extra = function CardExtra({ children, className, ...props }) {
  return <div className={cn('nm-card-extra', className)} {...domProps(props)}>{children}</div>;
};

export function Container({ children, className, textAlign, ...props }) {
  return <div className={cn('nm-container', textAlign && `nm-text-${textAlign}`, className)} {...domProps(props)}>{children}</div>;
}

export function Segment({ children, className, loading, ...props }) {
  return <section className={cn('nm-segment', loading && 'nm-segment-loading', className)} {...domProps(props)}>{loading ? <Spinner label='加载中...' /> : children}</section>;
}

function FieldLabel({ label }) {
  return label ? <span className='nm-form-label'>{label}</span> : null;
}

function callChange(handler, event, value, name) {
  if (handler) handler(event, { name, value, checked: event.target.checked });
}

export function FormInput({ label, icon, iconPosition, action, onChange, name, className, ...props }) {
  const handleChange = (event) => callChange(onChange, event, event.target.value, name);
  return (
    <label className={cn('nm-form-field', className)}>
      <FieldLabel label={label} />
      <span className='nm-input-wrap'>
        {icon ? <span className='nm-input-icon'>{typeof icon === 'string' ? React.cloneElement(getIcon(icon), { size: 15 }) : icon}</span> : null}
        <BaseInput name={name} onChange={handleChange} {...domProps(props)} />
        {action ? <span className='nm-input-action'>{action}</span> : null}
      </span>
    </label>
  );
}

export function FormTextArea({ label, onChange, name, className, ...props }) {
  return (
    <label className={cn('nm-form-field', className)}>
      <FieldLabel label={label} />
      <textarea
        className='nm-textarea'
        name={name}
        onChange={(event) => callChange(onChange, event, event.target.value, name)}
        {...domProps(props)}
      />
    </label>
  );
}

export function FormCheckbox({ label, checked, onChange, name, className, ...props }) {
  return (
    <label className={cn('nm-checkbox', className)}>
      <input
        type='checkbox'
        name={name}
        checked={checked}
        onChange={(event) => callChange(onChange, event, event.target.checked ? 'true' : 'false', name)}
        {...domProps(props)}
      />
      <span>{label}</span>
    </label>
  );
}

function normalizeOptions(options = []) {
  return options.map((option) => {
    if (typeof option === 'string' || typeof option === 'number') return { key: option, text: option, value: option };
    return option;
  });
}

export function SelectInput({
  label,
  options,
  value,
  defaultValue,
  onChange,
  name,
  className,
  placeholder,
  multiple = false,
  search = false,
  allowAdditions = false,
  onAddItem,
  onLabelClick,
  ...props
}) {
  const [query, setQuery] = React.useState('');
  const [additionalOptions, setAdditionalOptions] = React.useState([]);
  const list = [...normalizeOptions(options), ...additionalOptions];
  const filteredList = search && query
    ? list.filter((option) => String(option.text).toLowerCase().includes(query.toLowerCase()))
    : list;
  const selectedOptions = multiple && Array.isArray(value)
    ? list.filter((option) => value.some((selectedValue) => String(selectedValue) === String(option.value)))
    : !multiple && value !== undefined
      ? list.filter((option) => String(value) === String(option.value))
      : [];
  const renderedOptions = [...selectedOptions, ...filteredList.filter((option) => !selectedOptions.includes(option))];
  const addOption = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const event = { preventDefault() {} };
    const option = { key: trimmed, text: trimmed, value: trimmed };
    setAdditionalOptions((current) => [...current, option]);
    if (onAddItem) onAddItem(event, { value: trimmed });
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      onChange?.(event, { name, value: [...currentValues, trimmed] });
    } else {
      onChange?.(event, { name, value: trimmed });
    }
    setQuery('');
  };
  const handleChange = (event) => {
    const selectedValues = multiple
      ? Array.from(event.target.selectedOptions).map((option) => option.value)
      : event.target.value;
    const selected = multiple
      ? selectedValues.map((selectedValue) => {
          const option = list.find((item) => String(item.value) === selectedValue);
          return option ? option.value : selectedValue;
        })
      : list.find((option) => String(option.value) === event.target.value)?.value || event.target.value;
    callChange(onChange, event, selected, name);
    if (onLabelClick) {
      const values = Array.isArray(selected) ? selected : [selected];
      values.forEach((item) => onLabelClick(event, { value: item }));
    }
  };
  const normalizedValue = multiple
    ? (Array.isArray(value) ? value : []).map(String)
    : value === undefined ? undefined : String(value);
  const normalizedDefaultValue = multiple
    ? (Array.isArray(defaultValue) ? defaultValue : []).map(String)
    : defaultValue === undefined ? undefined : String(defaultValue);
  return (
    <label className={cn('nm-form-field', className)}>
      <FieldLabel label={label} />
      {search || allowAdditions ? (
        <div className='nm-select-search'>
          <input
            className='nm-input'
            value={query}
            aria-label={props['aria-label'] || label || '搜索'}
            placeholder={placeholder || '搜索或添加'}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && allowAdditions) {
                event.preventDefault();
                addOption();
              }
            }}
          />
          {allowAdditions ? <Button type='button' size='sm' variant='secondary' onClick={addOption}>添加</Button> : null}
        </div>
      ) : null}
      <select
        className='nm-select'
        name={name}
        multiple={multiple}
        value={normalizedValue}
        defaultValue={normalizedDefaultValue}
        onChange={handleChange}
        {...domProps(props)}
      >
        {!multiple && placeholder ? <option value=''>{placeholder}</option> : null}
        {renderedOptions.map((option, index) => (
          <option key={option.key ?? `${option.value}-${index}`} value={String(option.value)} disabled={option.disabled}>
            {option.text}
          </option>
        ))}
      </select>
      {onAddItem ? <small className='nm-field-hint'>可直接输入新项后添加</small> : null}
    </label>
  );
}

export function Form({ children, className, onSubmit, loading = false, ...props }) {
  return (
    <fieldset className={cn('nm-form-fieldset', loading && 'nm-form-loading')} disabled={loading}>
      <form className={cn('nm-form', className)} onSubmit={onSubmit} {...domProps(props)}>{children}</form>
    </fieldset>
  );
}
Form.Input = FormInput;
Form.TextArea = FormTextArea;
Form.Checkbox = FormCheckbox;
Form.Dropdown = SelectInput;
Form.Select = SelectInput;
Form.Field = function FormField({ children, label, className, ...props }) {
  return <div className={cn('nm-form-field', className)} {...domProps(props)}><FieldLabel label={label} />{children}</div>;
};
Form.Group = function FormGroup({ children, className, ...props }) {
  return <div className={cn('nm-form-group', className)} {...domProps(props)}>{children}</div>;
};
Form.Button = Button;

export function Input({ onChange, name, children, action, ...props }) {
  const inputProps = {
    name,
    onChange: (event) => callChange(onChange, event, event.target.value, name),
    ...domProps(props),
  };
  const field = children
    ? React.cloneElement(React.Children.only(children), inputProps)
    : <BaseInput {...inputProps} />;
  if (action) {
    return <span className='nm-input-wrap'>{field}<span className='nm-input-action'>{action}</span></span>;
  }
  return field;
}

export function Dropdown({ trigger, options, onChange, ...props }) {
  const [open, setOpen] = React.useState(false);
  if (trigger !== undefined) {
    const items = normalizeOptions(options);
    const triggerNode = React.isValidElement(trigger) && trigger.type !== React.Fragment
      ? React.cloneElement(trigger, { onClick: () => setOpen((value) => !value) })
      : <Button variant='ghost' size='sm' className='nm-dropdown-icon' aria-label='打开菜单' onClick={() => setOpen((value) => !value)}>•••</Button>;
    return (
      <span className='nm-dropdown'>
        {triggerNode}
        {open ? (
          <div className='nm-dropdown-menu' role='menu'>
            {items.map((option, index) => (
              <button
                key={option.key ?? `${option.value}-${index}`}
                type='button'
                className='nm-dropdown-item'
                onClick={async () => {
                  setOpen(false);
                  if (option.onClick) await option.onClick();
                  onChange?.({ target: { value: option.value } }, { value: option.value });
                }}
              >
                {option.text}
              </button>
            ))}
          </div>
        ) : null}
      </span>
    );
  }
  return <SelectInput options={options} onChange={onChange} {...props} />;
}
Dropdown.Menu = function DropdownMenu({ children }) { return <div className='nm-dropdown-menu'>{children}</div>; };
Dropdown.Item = function DropdownItem({ children, onClick, ...props }) { return <button type='button' className='nm-dropdown-item' onClick={onClick} {...domProps(props)}>{children}</button>; };

export function Select(props) {
  return <SelectInput {...props} />;
}

export function Label({ children, color, as: Component = 'span', className, ...props }) {
  return (
    <Component className={cn('nm-badge', `nm-badge-${toneForColor(color)}`, className)} {...domProps(props)}>
      {children}
    </Component>
  );
}

export function Message({ children, color, negative, warning, info, success, onDismiss, className, ...props }) {
  const tone = negative ? 'danger' : warning ? 'warning' : info ? 'info' : success ? 'success' : toneForColor(color);
  return (
    <div className={cn('nm-alert', `nm-alert-${tone}`, onDismiss && 'nm-alert-dismissible', className)} {...domProps(props)}>
      {onDismiss ? <button type='button' className='nm-alert-close' aria-label='关闭提示' onClick={onDismiss}>×</button> : null}
      {children}
    </div>
  );
}
Message.Header = function MessageHeader({ children, className, ...props }) { return <div className={cn('nm-alert-header', className)} {...domProps(props)}>{children}</div>; };
Message.Content = function MessageContent({ children, className, ...props }) { return <div className={cn('nm-alert-content', className)} {...domProps(props)}>{children}</div>; };

export function Header({ as: Element = 'h2', children, className, textAlign, ...props }) {
  return <Element className={cn('nm-heading', textAlign && `nm-text-${textAlign}`, className)} {...domProps(props)}>{children}</Element>;
}
Header.Content = function HeaderContent({ children }) { return <span className='nm-heading-content'>{children}</span>; };
Header.Subheader = function HeaderSubheader({ children }) { return <span className='nm-heading-subheader'>{children}</span>; };

export function Divider({ children, horizontal, className, ...props }) {
  return <div className={cn('nm-divider', horizontal && 'nm-divider-horizontal', className)} {...domProps(props)}>{children}</div>;
}

export function Image({ className, ...props }) { return <img className={cn('nm-image', className)} {...domProps(props)} alt={props.alt || ''} />; }

export function Grid({ children, columns, className, ...props }) {
  return <div className={cn('nm-grid', columns && `nm-grid-${columns}`, className)} {...domProps(props)}>{children}</div>;
}
Grid.Column = function GridColumn({ children, className, textAlign, ...props }) {
  return <div className={cn('nm-grid-column', textAlign && `nm-text-${textAlign}`, className)} {...domProps(props)}>{children}</div>;
};

export function Pagination({ activePage = 1, totalPages = 1, onPageChange, className, ...props }) {
  const pages = Math.max(1, Number(totalPages) || 1);
  const go = (page) => onPageChange && onPageChange({ preventDefault() {} }, { activePage: page });
  return (
    <nav className={cn('nm-pagination', className)} aria-label='分页' {...domProps(props)}>
      <Button variant='ghost' size='sm' disabled={activePage <= 1} onClick={() => go(activePage - 1)}>上一页</Button>
      <span>{activePage} / {pages}</span>
      <Button variant='ghost' size='sm' disabled={activePage >= pages} onClick={() => go(activePage + 1)}>下一页</Button>
    </nav>
  );
}

export function Popup({ trigger, content, children, on = 'hover' }) {
  const [open, setOpen] = React.useState(false);
  const panelContent = children || content;
  const hasPanel = panelContent !== undefined && panelContent !== null;
  const renderedTrigger = React.isValidElement(trigger)
    ? React.cloneElement(trigger, {
        onClick: (event) => {
          trigger.props.onClick?.(event);
          if (hasPanel) setOpen((value) => !value);
        },
      })
    : trigger;
  const hoverProps = on === 'click' ? {} : {
    onMouseEnter: () => hasPanel && setOpen(true),
    onMouseLeave: () => hasPanel && setOpen(false),
  };
  return (
    <span className='nm-popup' title={typeof content === 'string' ? content : undefined} {...hoverProps}>
      {renderedTrigger || children}
      {hasPanel && open ? <span className='nm-popup-panel'>{panelContent}</span> : null}
    </span>
  );
}

export function Modal({ open, onClose, children, className, ...props }) {
  const dialogRef = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
      if (event.key !== 'Tab' || !dialog) return;
      const nodes = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className='nm-modal-backdrop' role='presentation' onMouseDown={(event) => event.target === event.currentTarget && onClose && onClose()}>
      <section ref={dialogRef} className={cn('nm-modal', className)} role='dialog' aria-modal='true' {...domProps(props)}>
        <button type='button' className='nm-modal-close' aria-label='关闭' onClick={onClose}>×</button>
        {children}
      </section>
    </div>
  );
}
Modal.Header = function ModalHeader({ children, className, ...props }) { return <header className={cn('nm-modal-header', className)} {...domProps(props)}>{children}</header>; };
Modal.Content = function ModalContent({ children, className, ...props }) { return <div className={cn('nm-modal-content', className)} {...domProps(props)}>{children}</div>; };
Modal.Description = function ModalDescription({ children, className, ...props }) { return <div className={cn('nm-modal-description', className)} {...domProps(props)}>{children}</div>; };
Modal.Actions = function ModalActions({ children, className, ...props }) { return <footer className={cn('nm-modal-actions', className)} {...domProps(props)}>{children}</footer>; };

export function Table({ children, className, compact, size, ...props }) {
  return <div className={cn('nm-table-wrap', compact && 'nm-table-compact', size === 'small' && 'nm-table-small', className)}><table className='nm-table' {...domProps(props)}>{children}</table></div>;
}
Table.Header = function TableHeader({ children, ...props }) { return <thead {...domProps(props)}>{children}</thead>; };
Table.Body = function TableBody({ children, ...props }) { return <tbody {...domProps(props)}>{children}</tbody>; };
Table.Footer = function TableFooter({ children, ...props }) { return <tfoot {...domProps(props)}>{children}</tfoot>; };
Table.Row = function TableRow({ children, ...props }) { return <tr {...domProps(props)}>{children}</tr>; };
Table.HeaderCell = function TableHeaderCell({ children, ...props }) { return <th {...domProps(props)}>{children}</th>; };
Table.Cell = function TableCell({ children, ...props }) { return <td {...domProps(props)}>{children}</td>; };

export function Statistic({ children, color, className, ...props }) { return <div className={cn('nm-statistic', `nm-statistic-${toneForColor(color)}`, className)} {...domProps(props)}>{children}</div>; }
Statistic.Value = function StatisticValue({ children, ...props }) { return <div className='nm-statistic-value' {...domProps(props)}>{children}</div>; };
Statistic.Label = function StatisticLabel({ children, ...props }) { return <div className='nm-statistic-label' {...domProps(props)}>{children}</div>; };

export function Dimmer({ children, active }) { return active ? <div className='nm-dimmer'>{children}</div> : null; }
export function Loader({ children, ...props }) { return <Spinner label={children || props.children || '加载中...'} />; }

export function Tab({ panes = [], className, menu }) {
  const [active, setActive] = React.useState(0);
  return (
    <div className={cn('nm-tabs', className, menu?.className)}>
      <div className='nm-tab-list' role='tablist'>
        {panes.map((pane, index) => (
          <button
            key={index}
            id={`nm-tab-${index}`}
            type='button'
            role='tab'
            aria-selected={index === active}
            aria-controls={`nm-panel-${index}`}
            className={index === active ? 'nm-tab-active' : ''}
            onClick={() => setActive(index)}
          >
            {pane.menuItem}
          </button>
        ))}
      </div>
      <div id={`nm-panel-${active}`} className='nm-tab-content' role='tabpanel' aria-labelledby={`nm-tab-${active}`}>
        {panes[active]?.render?.()}
      </div>
    </div>
  );
}
Tab.Pane = function TabPane({ children, ...props }) { return <div className='nm-tab-pane' {...domProps(props)}>{children}</div>; };

export function Menu({ children, className, ...props }) { return <nav className={cn('nm-legacy-menu', className)} {...domProps(props)}>{children}</nav>; }
Menu.Item = function MenuItem({ children, as: Component = 'div', ...props }) { return <Component className='nm-menu-item' {...domProps(props)}>{children}</Component>; };
Menu.Menu = function MenuMenu({ children, ...props }) { return <div className='nm-menu-menu' {...domProps(props)}>{children}</div>; };

export function Icon({ name, ...props }) { return React.cloneElement(getIcon(name, props), { className: cn('nm-icon', props.className) }); }

export { Badge, BaseInput as ShadcnInput, CardHeader, CardContent };

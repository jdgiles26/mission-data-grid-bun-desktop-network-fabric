# Component Library API Reference

## Layout Components

### Card
Elevated container for grouping content.

```tsx
<Card>
  <CardHeader>Title</CardHeader>
  <CardBody>Content</CardBody>
  <CardFooter>Actions</CardFooter>
</Card>
```

**Props:**
- `children: React.ReactNode` - Content
- `className?: string` - Additional CSS classes

### Grid
Responsive multi-column layout.

```tsx
<Grid columns={3} gap="md">
  <Card>Item 1</Card>
  <Card>Item 2</Card>
  <Card>Item 3</Card>
</Grid>
```

**Props:**
- `columns: 1 | 2 | 3 | 4 | 6 | 12` - Number of columns (responsive)
- `gap: "xs" | "sm" | "md" | "lg" | "xl"` - Spacing between items
- `children: React.ReactNode`

### Flex
Flexbox container with alignment controls.

```tsx
<Flex direction="row" justify="between" align="center" gap="md">
  <span>Left</span>
  <span>Right</span>
</Flex>
```

**Props:**
- `direction: "row" | "col"` - Flex direction
- `justify: "start" | "center" | "end" | "between" | "around"` - Horizontal alignment
- `align: "start" | "center" | "end" | "stretch"` - Vertical alignment
- `gap: "xs" | "sm" | "md" | "lg" | "xl"` - Spacing
- `wrap: boolean` - Enable wrapping

### Stack
Vertical stack with consistent spacing.

```tsx
<Stack gap="md">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</Stack>
```

**Props:**
- `gap: "xs" | "sm" | "md" | "lg" | "xl"` - Spacing

## Display Components

### Badge
Status or category indicator.

```tsx
<Badge variant="success" size="md">
  Active
</Badge>
```

**Props:**
- `variant: "primary" | "secondary" | "success" | "warning" | "error" | "info"`
- `size: "sm" | "md" | "lg"`
- `children: React.ReactNode`

### Metric
KPI card with trend indicator.

```tsx
<Metric
  label="Latency"
  value={45}
  unit="ms"
  trend="down"
  trendValue="5%"
/>
```

**Props:**
- `label: string` - Metric name
- `value: string | number` - Current value
- `unit?: string` - Unit of measurement
- `trend?: "up" | "down" | "stable"` - Trend direction
- `trendValue?: string | number` - Trend percentage
- `icon?: React.ReactNode` - Optional icon

### Alert
Dismissible alert box.

```tsx
<Alert
  title="Error"
  message="Something went wrong"
  variant="error"
  onClose={() => {}}
/>
```

**Props:**
- `title: string` - Alert title
- `message?: string` - Alert description
- `variant: "info" | "success" | "warning" | "error"`
- `onClose?: () => void` - Close handler

### Spinner
Animated loading indicator.

```tsx
<Spinner size="md" />
```

**Props:**
- `size: "sm" | "md" | "lg"`

### StatusIndicator
Online/offline status indicator.

```tsx
<StatusIndicator status="online" label="Connected" />
```

**Props:**
- `status: "online" | "offline" | "warning" | "idle"`
- `label?: string` - Optional label
- `size: "sm" | "md" | "lg"`

## Input Components

### TextInput
Text input field with validation.

```tsx
<TextInput
  label="Email"
  type="email"
  error="Invalid email"
  hint="Enter your email"
  placeholder="you@example.com"
/>
```

**Props:**
- `label?: string` - Input label
- `error?: string` - Error message
- `hint?: string` - Help text
- `prefix?: React.ReactNode` - Left addon
- `suffix?: React.ReactNode` - Right addon
- Standard HTML input attributes

### Select
Dropdown select component.

```tsx
<Select
  label="Status"
  options={[
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" }
  ]}
/>
```

**Props:**
- `label?: string`
- `error?: string`
- `options: Array<{ value: string | number; label: string }>`

### Checkbox
Checkbox input with label.

```tsx
<Checkbox label="I agree to terms" description="You must agree" />
```

**Props:**
- `label?: string`
- `description?: string`
- Standard HTML input attributes

### RadioGroup
Radio button group.

```tsx
<RadioGroup
  name="theme"
  options={[
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" }
  ]}
  selected="light"
  onChange={(value) => console.log(value)}
/>
```

**Props:**
- `name: string` - Radio group name
- `options: Array<{ value: string; label: string; description?: string }>`
- `selected?: string` - Selected value
- `onChange?: (value: string) => void`

### Button
Clickable button.

```tsx
<Button variant="primary" size="md" onClick={handleClick}>
  Click me
</Button>
```

**Props:**
- `variant: "primary" | "secondary" | "danger" | "ghost"`
- `size: "sm" | "md" | "lg"`
- `loading?: boolean` - Show loading spinner
- `children: React.ReactNode`

### Toggle
Switch toggle component.

```tsx
<Toggle label="Enable notifications" checked={true} />
```

**Props:**
- `label?: string`
- `description?: string`
- `checked?: boolean`
- `onChange?: (e: ChangeEvent) => void`

## Data Display Components

### DataTable
Sortable, filterable table.

```tsx
<DataTable
  columns={[
    { key: "name", header: "Name", sortable: true },
    { key: "status", header: "Status", render: (val) => <Badge>{val}</Badge> }
  ]}
  rows={data}
  striped
  onRowClick={(row) => console.log(row)}
/>
```

**Props:**
- `columns: DataTableColumn[]` - Column definitions
- `rows: any[]` - Table rows
- `sortBy?: string` - Current sort column
- `sortDesc?: boolean` - Sort direction
- `onSort?: (key: string) => void` - Sort handler
- `onRowClick?: (row: any) => void` - Row click handler
- `striped?: boolean` - Alternating row colors
- `compact?: boolean` - Reduced padding

**Column Definition:**
```tsx
interface DataTableColumn<T> {
  key: keyof T;
  header: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  width?: string;
}
```

### Tabs
Tab panel interface.

```tsx
<Tabs
  tabs={[
    { id: "tab1", label: "Overview", content: <div>Content 1</div> },
    { id: "tab2", label: "Details", content: <div>Content 2</div> }
  ]}
  defaultTab="tab1"
/>
```

**Props:**
- `tabs: Array<{ id: string; label: string; content: React.ReactNode }>`
- `defaultTab?: string`
- `onChange?: (tab: string) => void`

### Accordion
Collapsible sections.

```tsx
<Accordion
  items={[
    { id: "1", title: "Section 1", content: <div>Content</div> },
    { id: "2", title: "Section 2", content: <div>Content</div> }
  ]}
  defaultOpen={["1"]}
/>
```

**Props:**
- `items: Array<{ id: string; title: string; content: React.ReactNode }>`
- `defaultOpen?: string[]` - Initially open section IDs

### Breadcrumbs
Navigation path indicator.

```tsx
<Breadcrumbs
  items={[
    { label: "Home", href: "/" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Settings" }
  ]}
/>
```

**Props:**
- `items: Array<{ label: string; href?: string; onClick?: () => void }>`

## Feedback Components

### Modal
Dialog box component.

```tsx
<Modal
  isOpen={isOpen}
  title="Confirm Action"
  onClose={() => setOpen(false)}
  footer={
    <>
      <Button onClick={() => setOpen(false)}>Cancel</Button>
      <Button variant="primary" onClick={handleConfirm}>Confirm</Button>
    </>
  }
>
  Are you sure?
</Modal>
```

**Props:**
- `isOpen: boolean`
- `title: string`
- `onClose: () => void`
- `children: React.ReactNode`
- `footer?: React.ReactNode`
- `size: "sm" | "md" | "lg" | "xl"`

### Toast
Notification toast.

```tsx
<Toast
  message="Operation successful"
  type="success"
  duration={3000}
  onClose={() => {}}
/>
```

**Props:**
- `message: string`
- `type: "info" | "success" | "warning" | "error"`
- `duration?: number` - Auto-dismiss time (ms)
- `onClose?: () => void`

### Tooltip
Hover tooltip.

```tsx
<Tooltip content="Help text" position="top">
  <button>Hover me</button>
</Tooltip>
```

**Props:**
- `content: React.ReactNode`
- `position: "top" | "right" | "bottom" | "left"`
- `delay?: number` - Hover delay (ms)
- `children: React.ReactNode`

### Drawer
Side panel.

```tsx
<Drawer
  isOpen={isOpen}
  title="Settings"
  onClose={() => setOpen(false)}
  position="right"
  width="400px"
>
  Drawer content
</Drawer>
```

**Props:**
- `isOpen: boolean`
- `title: string`
- `onClose: () => void`
- `children: React.ReactNode`
- `position: "left" | "right"`
- `width?: string`

## Visualization Components

### LineChart
Line chart with grid and zoom.

```tsx
<LineChart
  data={[
    { label: "Jan", value: 100 },
    { label: "Feb", value: 150 }
  ]}
  height={300}
  showGrid={true}
/>
```

**Props:**
- `data: ChartDataPoint[]` - Chart data
- `height?: number` - Chart height (px)
- `yAxisLabel?: string` - Y-axis label
- `xAxisLabel?: string` - X-axis label
- `showGrid?: boolean` - Show grid lines
- `showLegend?: boolean` - Show legend

### BarChart
Bar chart visualization.

```tsx
<BarChart
  data={[
    { label: "A", value: 100 },
    { label: "B", value: 200 }
  ]}
  colorScheme="multi"
/>
```

**Props:**
- `data: ChartDataPoint[]`
- `height?: number`
- `colorScheme: "primary" | "multi"`
- `showGrid?: boolean`

### PieChart
Pie chart with legend.

```tsx
<PieChart
  data={[
    { label: "A", value: 100 },
    { label: "B", value: 200 }
  ]}
  size={250}
  showLegend={true}
/>
```

**Props:**
- `data: ChartDataPoint[]`
- `size?: number` - Chart size (px)
- `showLegend?: boolean`
- `showLabels?: boolean`

## Styling & Theming

All components support:
- **Dark/Light mode** via CSS variables
- **Tailwind CSS** for consistent styling
- **Custom className** for overrides
- **Responsive breakpoints** (sm, md, lg, xl)

### CSS Variables
```css
--background     /* Page background */
--foreground     /* Text color */
--card           /* Card background */
--primary        /* Primary color */
--secondary      /* Secondary color */
--border         /* Border color */
--muted          /* Muted background */
--muted-foreground /* Muted text */
```

## Common Patterns

### Form with Validation
```tsx
<FormGroup label="Email" required error={emailError}>
  <TextInput
    type="email"
    placeholder="you@example.com"
    onChange={(e) => setEmail(e.target.value)}
  />
</FormGroup>
```

### Loading State
```tsx
<Button loading={isLoading} onClick={handleSubmit}>
  {isLoading ? "Submitting..." : "Submit"}
</Button>
```

### Conditional Rendering
```tsx
{data ? (
  <DataTable columns={cols} rows={data} />
) : (
  <Spinner />
)}
```

### Error Handling
```tsx
<Alert
  title="Error Loading Data"
  message={error?.message}
  variant="error"
  onClose={() => setError(null)}
/>
```

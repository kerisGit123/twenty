// Expense categories for everything you spend on — everyday life, your
// properties and your business — grouped the way people think about money.
// Used by the expense object (select options) and the Expenses page.
// Option ids are fixed once installed: never change an existing one.

export type ExpenseArea = 'EVERYDAY' | 'PROPERTY' | 'BUSINESS' | 'OTHER';

export type ExpenseGroup = {
  key: string;
  label: string;
  color: string;
  icon: string;
  area: ExpenseArea;
};

export type ExpenseCategory = {
  value: string;
  label: string;
  group: string;
  id: string;
};

export const EXPENSE_AREAS: Array<{ key: ExpenseArea; label: string; icon: string }> = [
  { key: 'EVERYDAY', label: 'Everyday', icon: '🏠' },
  { key: 'PROPERTY', label: 'Property', icon: '🏢' },
  { key: 'BUSINESS', label: 'Business', icon: '💼' },
  { key: 'OTHER', label: 'Other', icon: '📦' },
];

export const EXPENSE_GROUPS: ExpenseGroup[] = [
  // Everyday
  { key: 'HOUSEHOLD', label: 'Home & groceries', color: 'green', icon: '🛒', area: 'EVERYDAY' },
  { key: 'FOOD', label: 'Food & dining', color: 'orange', icon: '🍽️', area: 'EVERYDAY' },
  { key: 'TRANSPORT', label: 'Transport', color: 'blue', icon: '🚗', area: 'EVERYDAY' },
  { key: 'UTILITIES', label: 'Bills & utilities', color: 'sky', icon: '💡', area: 'EVERYDAY' },
  { key: 'HEALTH', label: 'Health', color: 'red', icon: '🩺', area: 'EVERYDAY' },
  { key: 'FAMILY', label: 'Family & kids', color: 'pink', icon: '👨‍👩‍👧', area: 'EVERYDAY' },
  { key: 'SHOPPING', label: 'Shopping', color: 'purple', icon: '🛍️', area: 'EVERYDAY' },
  { key: 'TRAVEL', label: 'Travel', color: 'turquoise', icon: '✈️', area: 'EVERYDAY' },
  { key: 'GIVING', label: 'Zakat & giving', color: 'green', icon: '🤲', area: 'EVERYDAY' },
  // Property
  { key: 'TAXES', label: 'Property taxes', color: 'blue', icon: '🏛️', area: 'PROPERTY' },
  { key: 'BUILDING', label: 'Building charges', color: 'purple', icon: '🏢', area: 'PROPERTY' },
  { key: 'UPKEEP', label: 'Repairs & upkeep', color: 'orange', icon: '🔧', area: 'PROPERTY' },
  { key: 'FURNISHING', label: 'Furnishing & renovation', color: 'turquoise', icon: '🛋️', area: 'PROPERTY' },
  { key: 'FINANCE', label: 'Loans & insurance', color: 'red', icon: '🏦', area: 'PROPERTY' },
  { key: 'FEES', label: 'Agent & legal fees', color: 'pink', icon: '📑', area: 'PROPERTY' },
  // Business
  { key: 'BUSINESS', label: 'Business', color: 'blue', icon: '💼', area: 'BUSINESS' },
  // Other
  { key: 'GOVERNMENT', label: 'Tax & government', color: 'yellow', icon: '🧾', area: 'OTHER' },
  { key: 'OTHER', label: 'Other', color: 'gray', icon: '📦', area: 'OTHER' },
];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  // Home & groceries
  { value: 'GROCERIES', label: 'Groceries', group: 'HOUSEHOLD', id: '0e41366e-6374-4609-8579-94df9724ad60' },
  { value: 'HOUSEHOLD_ITEMS', label: 'Household items', group: 'HOUSEHOLD', id: '818c3451-7b00-4773-9803-1db9c2ba65f3' },
  { value: 'HOME_HELP', label: 'Cleaner / home help', group: 'HOUSEHOLD', id: '86eb67cb-2ef7-451d-a479-435adccabb59' },
  // Food & dining
  { value: 'DINING', label: 'Eating out', group: 'FOOD', id: '623d04b0-5738-4aa5-8503-d8b04a8d1f1f' },
  { value: 'FOOD_DELIVERY', label: 'Food delivery', group: 'FOOD', id: 'b30dc931-ce20-484c-b8cb-e84f0e0dfadf' },
  { value: 'COFFEE', label: 'Coffee & snacks', group: 'FOOD', id: '968408bd-484b-4abe-b915-fcb5f2523d6f' },
  // Transport
  { value: 'PETROL', label: 'Petrol / charging', group: 'TRANSPORT', id: '16a2910c-2e88-4bf8-b768-6351c1e1faf2' },
  { value: 'TOLL_PARKING', label: 'Toll & parking', group: 'TRANSPORT', id: 'fcd94fd2-c5de-4d0d-8874-fea891981757' },
  { value: 'CAR_SERVICE', label: 'Car service & repairs', group: 'TRANSPORT', id: '51286573-2a26-428c-aeb0-a38d94565fe3' },
  { value: 'ROAD_TAX', label: 'Road tax & car insurance', group: 'TRANSPORT', id: '38f1630d-7872-427c-9d46-a52bb78de61d' },
  { value: 'CAR_LOAN', label: 'Car loan', group: 'TRANSPORT', id: '095e71cd-40ea-4ed3-b5f6-a1cb5b917ac4' },
  { value: 'RIDE_HAILING', label: 'Grab / taxi', group: 'TRANSPORT', id: 'e36c9ede-16ad-46e4-850a-c52dc7b04486' },
  { value: 'PUBLIC_TRANSPORT', label: 'Public transport', group: 'TRANSPORT', id: 'a9469ec9-0c7c-45ea-a4b0-cc2ae2270d12' },
  // Bills & utilities
  { value: 'ELECTRICITY', label: 'Electricity', group: 'UTILITIES', id: 'e146ebd8-9dcf-4472-b59a-856b327b7073' },
  { value: 'WATER', label: 'Water', group: 'UTILITIES', id: 'cdbda8e7-56b2-4c48-b609-525b4832a508' },
  { value: 'SEWERAGE', label: 'Sewerage (IWK)', group: 'UTILITIES', id: '7f393a9c-bb93-4d55-97eb-33b8af199cc4' },
  { value: 'INTERNET_TV', label: 'Internet / TV', group: 'UTILITIES', id: '3e9d5b70-2a1c-4f6b-8e47-c1d0a9f3b502' },
  { value: 'MOBILE', label: 'Mobile phone', group: 'UTILITIES', id: '2f49a2d1-7a3d-4d80-87f4-162ff6b3bc63' },
  { value: 'SUBSCRIPTIONS', label: 'Streaming & apps', group: 'UTILITIES', id: '318892e7-e424-4896-979a-4ba2e2cd85cf' },
  // Health
  { value: 'MEDICAL', label: 'Doctor & clinic', group: 'HEALTH', id: '3da3bcc9-894d-4231-b1f1-8bbff5ee2089' },
  { value: 'PHARMACY', label: 'Medicine & pharmacy', group: 'HEALTH', id: 'f5607404-0654-4af2-92ce-1d1fccf2537c' },
  { value: 'HEALTH_INSURANCE', label: 'Medical insurance', group: 'HEALTH', id: 'e79e9e6f-4f37-4701-83b7-3ec07717b19a' },
  { value: 'FITNESS', label: 'Gym & sports', group: 'HEALTH', id: '15a11b6e-291b-4989-b605-f118f66ea1dd' },
  // Family & kids
  { value: 'SCHOOL_FEES', label: 'School & tuition', group: 'FAMILY', id: 'debca5a4-867a-4c26-b2b7-4ee6c4c47b29' },
  { value: 'CHILDCARE', label: 'Childcare', group: 'FAMILY', id: '5e4e54cc-5dc7-40c0-ab1d-cb18092081d2' },
  { value: 'ALLOWANCE', label: 'Allowance & pocket money', group: 'FAMILY', id: '028d457a-80ff-4fbd-9f0e-4e559c66a4b1' },
  { value: 'GIFTS', label: 'Gifts & celebrations', group: 'FAMILY', id: '51db5805-e71f-4012-bf7f-ffcb48d92c08' },
  { value: 'PARENTS', label: 'Support for parents', group: 'FAMILY', id: '5f44d0ed-62b9-4e2a-ac88-54718095bc16' },
  // Shopping
  { value: 'CLOTHES', label: 'Clothes & shoes', group: 'SHOPPING', id: 'cbd6afc7-3e44-4ee3-9d57-06ded0df0527' },
  { value: 'ELECTRONICS', label: 'Electronics & gadgets', group: 'SHOPPING', id: '20ba4abb-da97-442d-9fa0-5468bd6d71fc' },
  { value: 'SHOPPING_OTHER', label: 'Other shopping', group: 'SHOPPING', id: 'd16be974-c669-42c6-ba81-b3a214591028' },
  // Travel
  { value: 'FLIGHTS', label: 'Flights & tickets', group: 'TRAVEL', id: 'dd57632c-4532-402e-84f8-fb921951172b' },
  { value: 'HOTELS', label: 'Hotels & stays', group: 'TRAVEL', id: '75d098f5-3ccc-4210-afe6-68662bf5725c' },
  { value: 'TRAVEL_OTHER', label: 'Holiday spending', group: 'TRAVEL', id: '676a4e24-d609-4b31-8744-26fbba30e9af' },
  // Zakat & giving
  { value: 'ZAKAT', label: 'Zakat', group: 'GIVING', id: '21e24db2-2ef1-442a-b94c-683049d8281b' },
  { value: 'DONATION', label: 'Donations & charity', group: 'GIVING', id: '89eaaf3e-13c8-4d49-9366-69be9c77fcbf' },
  // Property taxes
  { value: 'ASSESSMENT_TAX', label: 'Assessment tax (cukai pintu)', group: 'TAXES', id: '6cd40021-1484-43c1-bd05-0a3ca5b097c9' },
  { value: 'QUIT_RENT', label: 'Quit rent (cukai tanah)', group: 'TAXES', id: 'c2f4dbf2-5916-4c3e-911a-a5f2e29dc1a3' },
  // Building charges
  { value: 'MANAGEMENT_FEE', label: 'Maintenance fee', group: 'BUILDING', id: '6965b137-5697-4821-a322-e801e7eded62' },
  { value: 'SINKING_FUND', label: 'Sinking fund', group: 'BUILDING', id: '0b7c2a4e-6f1d-4e8a-9c35-7d2f1a8b6e01' },
  // Repairs & upkeep
  { value: 'REPAIRS', label: 'Repairs', group: 'UPKEEP', id: 'd2fa8444-22f5-4c2b-8349-f944e0ead23f' },
  { value: 'CLEANING', label: 'Cleaning', group: 'UPKEEP', id: '9a4f1c63-5b8e-4d27-a0f2-6e3b7c1d8f03' },
  { value: 'PEST_CONTROL', label: 'Pest control', group: 'UPKEEP', id: 'f1c8e2a9-7d3b-4a50-96e4-2b5d0c7a1f04' },
  { value: 'GARDENING', label: 'Gardening', group: 'UPKEEP', id: '5d2b9f41-8c6e-4b13-a7d9-0f4e3a2c6b05' },
  // Furnishing & renovation
  { value: 'FURNISHING', label: 'Furniture & appliances', group: 'FURNISHING', id: '277bec6b-4f31-4776-a458-2f723176b863' },
  { value: 'RENOVATION', label: 'Renovation', group: 'FURNISHING', id: '7b1d4f8a-3e6c-4a29-9d05-b2c8e1f4a609' },
  // Loans & insurance
  { value: 'LOAN_INTEREST', label: 'Housing loan', group: 'FINANCE', id: '23d154b2-665f-4af4-9a6b-11d39f276e15' },
  { value: 'INSURANCE', label: 'Fire / home insurance', group: 'FINANCE', id: '89361410-2cb2-4510-a5c1-2ccfc4934606' },
  { value: 'BANK_CHARGES', label: 'Bank charges', group: 'FINANCE', id: 'b6e0a3d8-1f4c-4e92-8b57-9c2d7f1a3e06' },
  // Agent & legal fees
  { value: 'AGENT_FEE', label: 'Agent fee', group: 'FEES', id: '554d0f61-809c-4e5c-86af-1f8d5dd3a203' },
  { value: 'LEGAL_STAMP_DUTY', label: 'Legal fees', group: 'FEES', id: '331aa18e-7bf1-4e58-87a0-c0b25696e997' },
  { value: 'STAMP_DUTY', label: 'Stamp duty', group: 'FEES', id: '4c7f2e95-0a8d-4b36-b1e3-5d9a6c2f8e07' },
  { value: 'ACCOUNTING', label: 'Accounting / tax agent', group: 'FEES', id: 'e8a3c1f6-9b2d-4f70-8c45-1a6e0d3b9f08' },
  // Business
  { value: 'OFFICE', label: 'Office & supplies', group: 'BUSINESS', id: '24e87b3b-38fe-4871-be0d-830390eb9bf0' },
  { value: 'SALARIES', label: 'Staff & salaries', group: 'BUSINESS', id: '584c6ea9-e1d8-42b9-b8c6-94c89fe9d0be' },
  { value: 'PROFESSIONAL', label: 'Professional services', group: 'BUSINESS', id: 'fb9f29d4-757b-4667-8e6f-8077860b6adb' },
  { value: 'MARKETING', label: 'Marketing & ads', group: 'BUSINESS', id: '129ab3e7-47a2-4ba2-954c-7dda487826f3' },
  { value: 'SOFTWARE', label: 'Software & tools', group: 'BUSINESS', id: 'f743e2a7-d108-4912-8048-5ebefe660557' },
  { value: 'BUSINESS_OTHER', label: 'Other business costs', group: 'BUSINESS', id: '86a1b3b8-9b5c-44a2-a047-0385407368bb' },
  // Tax & government
  { value: 'INCOME_TAX', label: 'Income tax', group: 'GOVERNMENT', id: '63e45253-2c0b-4cf1-abfe-1b9494f39e57' },
  { value: 'GOV_FEES', label: 'Government fees & fines', group: 'GOVERNMENT', id: '41d3a505-cd0d-4df0-b974-779b833bc40b' },
  // Other
  { value: 'OTHER', label: 'Other', group: 'OTHER', id: 'f83ca586-ab0e-4f68-afac-4ea0dc9bfa2b' },
];

const GROUP_BY_KEY = Object.fromEntries(EXPENSE_GROUPS.map((group) => [group.key, group]));
const CATEGORY_BY_VALUE = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category.value, category]));

export const expenseCategory = (value: string | null | undefined): ExpenseCategory =>
  CATEGORY_BY_VALUE[value ?? 'OTHER'] ?? CATEGORY_BY_VALUE.OTHER;

export const expenseGroup = (value: string | null | undefined): ExpenseGroup =>
  GROUP_BY_KEY[expenseCategory(value).group] ?? GROUP_BY_KEY.OTHER;

export const groupByKey = (key: string): ExpenseGroup => GROUP_BY_KEY[key] ?? GROUP_BY_KEY.OTHER;

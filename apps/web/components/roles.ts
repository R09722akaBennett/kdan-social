// Plain data, not in a 'use client' module: a server component importing a value from
// one gets a client reference instead of the object.
export const ROLE_TEXT: Record<string, { name: string; detail: string }> = {
  owner: { name: '擁有者', detail: '建立工作區的人；可以做所有事，包括切換對外發文' },
  admin: { name: '管理員', detail: '可以核准貼文、管理帳號、群組與成員' },
  editor: { name: '編輯', detail: '可以寫貼文；送出後要擁有者或管理員核准才會發出' },
  reviewer: { name: '審閱者', detail: '可以看貼文與留言' },
};

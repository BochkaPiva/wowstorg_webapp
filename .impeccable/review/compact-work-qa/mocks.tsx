export { useRouter, useSearchParams } from "../work-launch-qa/mocks";
export const usePathname = () => location.pathname;
export const useAuth = () => ({ state: { status: "authenticated", user: { id: "qa-user", role: "WOWSTORG", displayName: "Тестовые данные · без рабочей БД" } }, refresh: async () => {} });
export const InAppNotifications = () => null;

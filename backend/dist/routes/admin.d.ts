declare const router: import("express-serve-static-core").Router;
declare global {
    namespace Express {
        interface Request {
            user?: any;
        }
    }
}
export default router;

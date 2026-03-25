import { toast as sonner, type ExternalToast } from 'sonner'

const ERROR_DURATION = 10_000

type ToastFn = typeof sonner

export const toast: ToastFn = Object.assign(
  (...args: Parameters<ToastFn>) => sonner(...args),
  {
    ...sonner,
    error(message: Parameters<ToastFn['error']>[0], opts?: ExternalToast) {
      return sonner.error(message, { duration: ERROR_DURATION, ...opts })
    },
    warning(message: Parameters<ToastFn['warning']>[0], opts?: ExternalToast) {
      return sonner.warning(message, { duration: ERROR_DURATION, ...opts })
    },
  },
)

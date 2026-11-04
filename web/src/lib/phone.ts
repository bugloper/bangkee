// The invite goes from the owner's own phone: WhatsApp or SMS opens with the
// customer's number and the message already written. A Bhutanese number is
// eight digits; WhatsApp wants the country code in front.

function international(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  return digits.length === 8 ? `975${digits}` : digits
}

export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${international(phone)}?text=${encodeURIComponent(message)}`
}

/** `?&body=` is the form both iPhone and Android read. */
export function smsLink(phone: string, message: string): string {
  return `sms:+${international(phone)}?&body=${encodeURIComponent(message)}`
}

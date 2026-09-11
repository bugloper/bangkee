# Turning what somebody typed into chetrum. The same conversion HasMoneyAttribute
# does for model attributes, for the times a controller is handed a bare amount
# that belongs to no single record.
module Money
  def self.cents(input)
    return 0 if input.blank?

    (BigDecimal(input.to_s.delete(",").strip) * 100).round
  rescue ArgumentError, TypeError
    0
  end
end

# Money lives in the database as integer chetrum (BR-1). This gives a model a
# major-unit accessor for forms — `amount` reads/writes `amount_cents` — so
# views never have to multiply by 100 themselves (BR-2).
module HasMoneyAttribute
  extend ActiveSupport::Concern

  class_methods do
    def has_money_attribute(*names)
      names.each do |name|
        cents = :"#{name}_cents"

        define_method(name) do
          value = self[cents]
          value.nil? ? nil : BigDecimal(value.to_s) / 100
        end

        define_method(:"#{name}=") do |value|
          self[cents] =
            case value
            when nil, "" then nil
            else
              decimal = begin
                BigDecimal(value.to_s.delete(",").strip)
              rescue ArgumentError, TypeError
                nil
              end
              decimal && (decimal * 100).round
            end
        end
      end
    end
  end
end

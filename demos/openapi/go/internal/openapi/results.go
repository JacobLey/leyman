package openapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
)

// ErrResult is a result that isn't a struct of status-tagged pointers with exactly one set.
var ErrResult = errors.New("openapi: invalid result")

// statusField is one field of a result struct, and the status its tag names.
type statusField struct {
	index  int
	status int
}

// statusFields are the status-tagged fields of a result struct type: each a pointer, tagged `status:"<code>"`.
func statusFields(resultType reflect.Type) ([]statusField, error) {
	if resultType.Kind() != reflect.Struct {
		return nil, fmt.Errorf("%w: %s is not a struct", ErrResult, resultType)
	}

	fields := make([]statusField, 0, resultType.NumField())

	for index := range resultType.NumField() {
		field := resultType.Field(index)

		status, err := strconv.Atoi(field.Tag.Get("status"))
		if err != nil || field.Type.Kind() != reflect.Pointer {
			return nil, fmt.Errorf("%w: %s.%s is not a pointer tagged with a status", ErrResult, resultType, field.Name)
		}

		fields = append(fields, statusField{index: index, status: status})
	}

	return fields, nil
}

// ResultStatuses are the statuses a result struct type has a field for, in field order.
func ResultStatuses(resultType reflect.Type) ([]int, error) {
	fields, err := statusFields(resultType)
	if err != nil {
		return nil, err
	}

	statuses := make([]int, len(fields))
	for index, field := range fields {
		statuses[index] = field.status
	}

	return statuses, nil
}

// ResultResponse is the status and body of the one field a result sets.
func ResultResponse(result any) (int, any, error) {
	value := reflect.ValueOf(result)

	fields, err := statusFields(value.Type())
	if err != nil {
		return 0, nil, err
	}

	set := -1

	for index, field := range fields {
		if !value.Field(field.index).IsNil() {
			if set >= 0 {
				return 0, nil, fmt.Errorf("%w: %s sets more than one response", ErrResult, value.Type())
			}

			set = index
		}
	}

	if set < 0 {
		return 0, nil, fmt.Errorf("%w: %s sets no response", ErrResult, value.Type())
	}

	return fields[set].status, value.Field(fields[set].index).Interface(), nil
}

// SetResult decodes a JSON body into the field of result (a pointer to a result struct) for status. It returns false,
// setting nothing, when the struct has no field for status.
func SetResult(result any, status int, body []byte) (bool, error) {
	value := reflect.ValueOf(result).Elem()

	fields, err := statusFields(value.Type())
	if err != nil {
		return false, err
	}

	for _, field := range fields {
		if field.status != status {
			continue
		}

		target := reflect.New(value.Field(field.index).Type().Elem())
		if err := json.Unmarshal(body, target.Interface()); err != nil {
			return false, fmt.Errorf("decoding the %d response's body: %w", status, err)
		}

		value.Field(field.index).Set(target)

		return true, nil
	}

	return false, nil
}
